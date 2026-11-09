#!/usr/bin/env node
/**
 * Allowance MCP server.
 *
 * Gives any MCP-capable agent (Claude Desktop, Claude Code, others) a spending
 * allowance instead of a payment method. The agent holds only an Allowance key;
 * PayPal credentials and the saved PayPal account stay on the Allowance server.
 *
 *   ALLOWANCE_URL=https://your-allowance.onrender.com \
 *   ALLOWANCE_AGENT_KEY=alw_key_... \
 *   npx tsx mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.ALLOWANCE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.ALLOWANCE_AGENT_KEY ?? "";
const WAIT_MS = Number(process.env.ALLOWANCE_WAIT_MS ?? 120_000);

if (!KEY.startsWith("alw_key_")) {
  console.error("Set ALLOWANCE_AGENT_KEY to the key shown when you created the allowance.");
  process.exit(1);
}

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const dollars = (cents: unknown) => `$${(Number(cents) / 100).toFixed(2)}`;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

const server = new McpServer({ name: "allowance", version: "1.0.0" });

server.registerTool(
  "check_allowance",
  {
    title: "Check allowance",
    description: "How much you can still spend, the most one purchase can cost, and the categories you can buy in without asking.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { status, body } = await call("/api/agent/allowance");
    if (status !== 200) return text(String(body.error ?? `Error ${status}`));
    return text(
      `${body.name} (${body.status}). Left this ${body.period}: ${dollars(body.remainingCents)} of ${dollars(body.capCents)}. ` +
        `Per purchase: up to ${dollars(body.perPurchaseCents)}. Categories: ${(body.categories as string[]).join(", ")}.`,
    );
  },
);

server.registerTool(
  "search_shops",
  {
    title: "Search shops",
    description: "Find items to buy. Returns shop id, sku, name, price and category.",
    inputSchema: { query: z.string().describe("Plain words, e.g. 'oat milk'") },
    annotations: { readOnlyHint: true },
  },
  async ({ query }) => {
    const { status, body } = await call(`/api/agent/shops?q=${encodeURIComponent(query)}`);
    if (status !== 200) return text(String(body.error ?? `Error ${status}`));
    const rows = body.results as { shopId: string; shop: string; category: string; sku: string; name: string; priceCents: number }[];
    if (rows.length === 0) return text(`Nothing matches "${query}".`);
    return text(rows.map((r) => `${r.shopId} (${r.shop}, ${r.category}) sku ${r.sku}: ${r.name}, ${dollars(r.priceCents)}`).join("\n"));
  },
);

server.registerTool(
  "buy",
  {
    title: "Buy",
    description:
      "Buy items from one shop, paid from the owner's allowance through PayPal. You name items, the shop sets prices. " +
      "If it's outside the allowance, this waits for the owner to approve or decline and returns their answer. Don't split or retry held purchases.",
    inputSchema: {
      shop_id: z.string(),
      items: z.array(z.object({ sku: z.string(), qty: z.number().int().min(1).max(20) })).min(1),
      reason: z.string().describe("One sentence the owner will read"),
    },
  },
  async ({ shop_id, items, reason }) => {
    let { status, body } = await call("/api/agent/purchases", {
      method: "POST",
      body: JSON.stringify({ shopId: shop_id, items, reason }),
    });
    if (status >= 400) return text(String(body.error ?? `Error ${status}`));
    const deadline = Date.now() + WAIT_MS;
    while (body.status === "held" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      ({ status, body } = await call(`/api/agent/purchases/${body.id}`));
    }
    switch (body.status) {
      case "completed":
        return text(`Bought from ${body.shop} for ${dollars(body.amountCents)}${body.approvedByOwner ? " (owner approved)" : ""}. PayPal order ${body.paypalOrderId}.`);
      case "held":
        return text(`Still waiting for the owner on ${dollars(body.amountCents)} at ${body.shop}. Leave it with them.`);
      case "declined":
        return text(`The owner declined ${dollars(body.amountCents)} at ${body.shop}. Don't retry it.`);
      case "blocked":
        return text(`Blocked: ${(body.reasons as string[]).join(" ")} Nothing was charged.`);
      default:
        return text(`Not completed (${body.status}): ${body.error ?? "no details"}.`);
    }
  },
);

await server.connect(new StdioServerTransport());
