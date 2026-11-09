import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { db } from "./db";
import { MERCHANTS, searchCatalog } from "./catalog";
import { formatCents } from "./policy";
import { getAllowance, requestPurchase, summarise, waitForDecision, type Purchase } from "./store";

/**
 * The household shopping agent. It runs on Claude and can only act through
 * three tools; it holds no payment details. Every purchase goes through the
 * Allowance rules, and an out-of-policy one waits for the owner's answer.
 *
 * Without an Anthropic key it runs a scripted version of the demo task, and
 * the run is labelled "scripted" in the UI.
 */

export const AGENT_MODEL = "claude-sonnet-5-5";
const OWNER_WAIT_MS = 120_000;
const MAX_TURNS = 14;

export type EventKind = "start" | "thinking" | "search" | "check" | "purchase" | "waiting" | "decision" | "say" | "error" | "done";

export interface RunEvent {
  seq: number;
  runId: string;
  at: string;
  kind: EventKind;
  text: string;
  data: Record<string, unknown> | null;
}

function log(runId: string, kind: EventKind, text: string, data?: Record<string, unknown>) {
  db()
    .prepare("INSERT INTO run_events (run_id, at, kind, text, data) VALUES (?, ?, ?, ?, ?)")
    .run(runId, new Date().toISOString(), kind, text, data ? JSON.stringify(data) : null);
}

export function runEvents(runId: string, afterSeq = 0): RunEvent[] {
  return (
    db().prepare("SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq").all(runId, afterSeq) as Record<string, unknown>[]
  ).map((r) => ({
    seq: r.seq as number,
    runId: r.run_id as string,
    at: r.at as string,
    kind: r.kind as EventKind,
    text: r.text as string,
    data: r.data ? JSON.parse(r.data as string) : null,
  }));
}

export function latestRun(workspaceId: string) {
  const r = db().prepare("SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1").get(workspaceId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    allowanceId: r.allowance_id as string,
    task: r.task as string,
    mode: r.mode as "claude" | "scripted",
    status: r.status as "running" | "done" | "failed",
    createdAt: r.created_at as string,
  };
}

// ---------- tools ----------

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_shops",
    description:
      "Search the shops you can buy from. Returns matching items with shop id, item sku, name, price and the shop's category. Use plain words like 'oat milk' or 'headphones'.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "check_allowance",
    description:
      "See your spending allowance: how much is left this period, the most one purchase can cost, and which categories you can buy in without asking the owner.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "buy",
    description:
      "Buy items from one shop, paid through the owner's allowance. Prices come from the shop; you only name items and quantities. If the purchase is outside the allowance it waits for the owner to approve or decline, and this tool returns their answer.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        shop_id: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, qty: { type: "integer" } },
            required: ["sku", "qty"],
            additionalProperties: false,
          },
        },
        reason: { type: "string", description: "One short sentence the owner will read: why you're buying this." },
      },
      required: ["shop_id", "items", "reason"],
      additionalProperties: false,
    },
  },
];

const SYSTEM = `You are a household shopping agent. You buy things for your owner, paying from an allowance they set: a spending cap per period, a limit per purchase, and categories you can buy in without asking.

How to work:
- Check your allowance first, then search for what the task needs, then buy.
- Buy each shop's items in a single purchase. Pick sensible everyday quantities.
- Never try to get around a limit. Don't split a purchase into smaller ones, don't swap in a different shop to dodge a hold, and don't retry something the owner declined. If a purchase is held, the buy tool waits for the owner's answer; accept it.
- If something can't be bought, say so plainly and move on.
- When you're done, write two or three plain sentences for the owner: what you bought, what it cost, and anything that needs their attention. No lists, no headings.`;

function describePurchase(p: Purchase): string {
  const items = p.lines.map((l) => `${l.qty} × ${l.name}`).join(", ");
  switch (p.status) {
    case "completed":
      return `Bought ${items} at ${p.merchantName} for ${formatCents(p.amountCents)}${p.approvedByOwner ? " after the owner approved it" : ""}. PayPal order ${p.paypalOrderId}.`;
    case "declined":
      return `The owner declined ${formatCents(p.amountCents)} at ${p.merchantName}. Don't retry it or buy it elsewhere.`;
    case "blocked":
      return `Blocked: ${p.reasons.join(" ")} Nothing was charged. Don't retry it.`;
    case "held":
      return `The owner hasn't answered yet about ${formatCents(p.amountCents)} at ${p.merchantName}. Leave it with them and carry on.`;
    case "expired":
      return `The request for ${formatCents(p.amountCents)} at ${p.merchantName} expired without an answer. Nothing was charged.`;
    case "failed":
      return `PayPal couldn't complete ${formatCents(p.amountCents)} at ${p.merchantName}: ${p.error}`;
    default:
      return `Status: ${p.status}.`;
  }
}

async function runTool(runId: string, allowanceId: string, name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "search_shops") {
    const query = String(input.query ?? "");
    const hits = searchCatalog(query);
    log(runId, "search", `Searched for “${query}”`, { query, hits: hits.length });
    if (hits.length === 0) return `Nothing matches "${query}". Shops: ${MERCHANTS.map((m) => m.name).join(", ")}.`;
    return hits
      .map((h) => `${h.merchant.id} (${h.merchant.name}, ${h.merchant.category}) — sku ${h.item.sku}: ${h.item.name}, ${formatCents(h.item.priceCents)}`)
      .join("\n");
  }

  if (name === "check_allowance") {
    const a = getAllowance(allowanceId)!;
    const s = summarise(allowanceId);
    log(runId, "check", `Checked the allowance: ${formatCents(s.remainingCents)} left`, { remainingCents: s.remainingCents });
    return [
      `Allowance "${a.name}" (${a.status}).`,
      `Left this ${a.period}: ${formatCents(s.remainingCents)} of ${formatCents(a.capCents)}.`,
      `Most one purchase can cost without asking: ${formatCents(a.perPurchaseCents)}.`,
      `Categories you can buy in without asking: ${a.categories.join(", ")}.`,
      a.expiresAt ? `Expires ${a.expiresAt}.` : "",
    ].join("\n");
  }

  if (name === "buy") {
    const items = Array.isArray(input.items) ? (input.items as { sku: string; qty: number }[]) : [];
    const reason = String(input.reason ?? "");
    let result;
    try {
      result = await requestPurchase({ allowanceId, merchantId: String(input.shop_id), items, note: reason, runId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "That purchase couldn't be made.";
      log(runId, "error", msg);
      return msg;
    }
    let p = result.purchase;
    if (p.status === "held") {
      log(runId, "waiting", `Asked to spend ${formatCents(p.amountCents)} at ${p.merchantName}. It's outside the allowance, so it's waiting for you.`, {
        purchaseId: p.id,
        status: "held",
        reasons: p.reasons,
      });
      p = await waitForDecision(p.id, OWNER_WAIT_MS);
      log(runId, "decision", describePurchase(p), { purchaseId: p.id, status: p.status });
    } else {
      log(runId, "purchase", describePurchase(p), { purchaseId: p.id, status: p.status, amountCents: p.amountCents });
    }
    return describePurchase(p);
  }

  return `Unknown tool ${name}.`;
}

// ---------- runs ----------

/** Every agent run across all workspaces in the last 24 hours. Caps what the hosted demo can spend on Claude. */
export function runsInLastDay(): number {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return (db().prepare("SELECT COUNT(*) AS n FROM runs WHERE created_at > ?").get(since) as { n: number }).n;
}

export function startRun(workspaceId: string, allowanceId: string, task: string): { runId: string; mode: "claude" | "scripted" } {
  const mode = process.env.ANTHROPIC_API_KEY ? "claude" : "scripted";
  const runId = `run_${crypto.randomBytes(9).toString("base64url")}`;
  db()
    .prepare("INSERT INTO runs (id, workspace_id, allowance_id, task, mode, status, created_at) VALUES (?, ?, ?, ?, ?, 'running', ?)")
    .run(runId, workspaceId, allowanceId, task, mode, new Date().toISOString());
  db().prepare("UPDATE workspaces SET runs_used = runs_used + 1 WHERE id = ?").run(workspaceId);
  log(runId, "start", task, { mode, model: mode === "claude" ? AGENT_MODEL : null });

  const work =
    mode === "claude"
      ? runClaude(runId, allowanceId, task).catch(async (err) => {
          // Demo safety: if Claude can't be reached before the agent has done anything, run the scripted task instead.
          if (!(err instanceof ClaudeUnavailable)) throw err;
          log(runId, "error", `${err.message} Switching to the scripted demo so the rules and PayPal can still be shown.`);
          db().prepare("UPDATE runs SET mode = 'scripted' WHERE id = ?").run(runId);
          await runScripted(runId, allowanceId);
        })
      : runScripted(runId, allowanceId);
  work
    .then(() => db().prepare("UPDATE runs SET status = 'done', finished_at = ? WHERE id = ?").run(new Date().toISOString(), runId))
    .catch((err) => {
      log(runId, "error", err instanceof Error ? err.message : "The agent stopped unexpectedly.");
      db().prepare("UPDATE runs SET status = 'failed', finished_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
    })
    .finally(() => log(runId, "done", "Run finished"));
  return { runId, mode };
}

/** Claude couldn't be reached before the agent took any action. */
class ClaudeUnavailable extends Error {}

async function runClaude(runId: string, allowanceId: string, task: string) {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: task }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: AGENT_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      const Fail = turn === 0 ? ClaudeUnavailable : Error;
      if (err instanceof Anthropic.AuthenticationError) throw new Fail("The Anthropic key was rejected.");
      if (err instanceof Anthropic.RateLimitError) throw new Fail("Claude is rate-limited right now.");
      if (err instanceof Anthropic.APIConnectionError) throw new Fail("Couldn't reach Claude.");
      if (err instanceof Anthropic.APIError) throw new Fail(`Claude returned an error (${err.status}).`);
      throw err;
    }

    for (const block of response.content) {
      if (block.type === "thinking" && block.thinking.trim()) log(runId, "thinking", block.thinking.trim());
      if (block.type === "text" && block.text.trim()) log(runId, "say", block.text.trim());
    }

    if (response.stop_reason === "refusal") {
      log(runId, "error", "Claude declined to continue this task.");
      return;
    }
    // Append the whole response, unchanged, so thinking blocks stay valid.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") return;

    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const content = await runTool(runId, allowanceId, call.name, (call.input ?? {}) as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: call.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  log(runId, "error", "The agent hit its step limit and stopped.");
}

/** The demo task without a model: same tools, same rules, fixed steps. */
async function runScripted(runId: string, allowanceId: string) {
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  log(runId, "thinking", "Scripted run: these steps are fixed, but every rule check and PayPal call is real.");
  await pause(700);
  await runTool(runId, allowanceId, "check_allowance", {});
  await pause(700);
  await runTool(runId, allowanceId, "search_shops", { query: "oat milk eggs sourdough coffee" });
  await pause(700);
  await runTool(runId, allowanceId, "buy", {
    shop_id: "corner-grocer",
    items: [
      { sku: "oat-milk-1l", qty: 2 },
      { sku: "eggs-12", qty: 1 },
      { sku: "sourdough", qty: 1 },
    ],
    reason: "Weekly restock of the basics on the list.",
  });
  await pause(700);
  await runTool(runId, allowanceId, "search_shops", { query: "headphones" });
  await pause(700);
  const headphones = await runTool(runId, allowanceId, "buy", {
    shop_id: "voltline",
    items: [{ sku: "nc-headphones", qty: 1 }],
    reason: "Replacement for the broken headphones you mentioned.",
  });
  const outcome = headphones.startsWith("Bought")
    ? "You approved the headphones, so they're bought too."
    : headphones.includes("declined")
      ? "You declined the headphones, so I left them."
      : headphones.startsWith("Blocked")
        ? "The headphones were blocked, so nothing was charged for them."
        : "The headphones are still waiting for your answer.";
  log(runId, "say", `Restocked the basics at Corner Grocer. ${outcome}`);
}
