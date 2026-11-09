import crypto from "node:crypto";
import { db, tx } from "./db";
import { priceBasket, type PricedLine } from "./catalog";
import { evaluatePurchase, type Allowance as PolicyAllowance, type Decision, type Period } from "./policy";
import { paypal, PayPalError } from "./paypal";

/** A held purchase waits this long for the owner before it expires. */
export const HOLD_TTL_MS = 30 * 60 * 1000;

export type AllowanceStatus = "active" | "paused" | "revoked";
export type PurchaseStatus = "charging" | "completed" | "held" | "declined" | "blocked" | "failed" | "expired";

export interface AllowanceRow {
  id: string;
  workspaceId: string;
  name: string;
  agentName: string;
  agentKeyHint: string;
  capCents: number;
  period: Period;
  perPurchaseCents: number;
  categories: string[];
  merchantsAllowed: string[];
  merchantsBlocked: string[];
  expiresAt: string | null;
  status: AllowanceStatus;
  createdAt: string;
}

export interface Purchase {
  id: string;
  workspaceId: string;
  allowanceId: string;
  runId: string | null;
  merchantId: string;
  merchantName: string;
  category: string;
  lines: PricedLine[];
  amountCents: number;
  agentNote: string;
  outcome: "allow" | "hold" | "block";
  status: PurchaseStatus;
  reasons: string[];
  approvalToken: string | null;
  approvedByOwner: boolean;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  paypalStatus: string | null;
  paypalDebugId: string | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
}

type Row = Record<string, unknown>;

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

function toAllowance(r: Row): AllowanceRow {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    name: r.name as string,
    agentName: r.agent_name as string,
    agentKeyHint: r.agent_key_hint as string,
    capCents: r.cap_cents as number,
    period: r.period as Period,
    perPurchaseCents: r.per_purchase_cents as number,
    categories: JSON.parse(r.categories as string),
    merchantsAllowed: JSON.parse(r.merchants_allowed as string),
    merchantsBlocked: JSON.parse(r.merchants_blocked as string),
    expiresAt: (r.expires_at as string) ?? null,
    status: r.status as AllowanceStatus,
    createdAt: r.created_at as string,
  };
}

function toPurchase(r: Row): Purchase {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    allowanceId: r.allowance_id as string,
    runId: (r.run_id as string) ?? null,
    merchantId: r.merchant_id as string,
    merchantName: r.merchant_name as string,
    category: r.category as string,
    lines: JSON.parse(r.lines as string),
    amountCents: r.amount_cents as number,
    agentNote: r.agent_note as string,
    outcome: r.outcome as Purchase["outcome"],
    status: r.status as PurchaseStatus,
    reasons: JSON.parse(r.reasons as string),
    approvalToken: (r.approval_token as string) ?? null,
    approvedByOwner: r.approved_by_owner === 1,
    paypalOrderId: (r.paypal_order_id as string) ?? null,
    paypalCaptureId: (r.paypal_capture_id as string) ?? null,
    paypalStatus: (r.paypal_status as string) ?? null,
    paypalDebugId: (r.paypal_debug_id as string) ?? null,
    error: (r.error as string) ?? null,
    createdAt: r.created_at as string,
    decidedAt: (r.decided_at as string) ?? null,
  };
}

// ---------- workspaces ----------

export function createWorkspace(ownerName: string): string {
  const id = newId("ws");
  db().prepare("INSERT INTO workspaces (id, owner_name, created_at) VALUES (?, ?, ?)").run(id, ownerName, nowIso());
  return id;
}

export function getWorkspace(id: string) {
  const r = db().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    ownerName: r.owner_name as string,
    vaultId: (r.vault_id as string) ?? null,
    payerEmail: (r.payer_email as string) ?? null,
    pendingSetupToken: (r.pending_setup_token as string) ?? null,
    runsUsed: r.runs_used as number,
  };
}

export function connectVault(workspaceId: string, vaultId: string, payerEmail: string | null): void {
  db()
    .prepare("UPDATE workspaces SET vault_id = ?, payer_email = ?, pending_setup_token = NULL WHERE id = ?")
    .run(vaultId, payerEmail, workspaceId);
}

export function setPendingSetupToken(workspaceId: string, token: string): void {
  db().prepare("UPDATE workspaces SET pending_setup_token = ? WHERE id = ?").run(token, workspaceId);
}

/** The saved PayPal this workspace pays with: its own, or the shared sandbox demo account. */
export function payingVault(workspaceId: string): { vaultId: string; shared: boolean } | null {
  const w = getWorkspace(workspaceId);
  if (w?.vaultId) return { vaultId: w.vaultId, shared: false };
  if (process.env.DEMO_VAULT_ID) return { vaultId: process.env.DEMO_VAULT_ID, shared: true };
  return null;
}

// ---------- allowances ----------

export interface NewAllowance {
  name: string;
  agentName: string;
  capCents: number;
  period: Period;
  perPurchaseCents: number;
  categories: string[];
  merchantsAllowed?: string[];
  merchantsBlocked: string[];
  expiresAt: string | null;
}

/** Returns the agent key once. Only its hash is stored. */
export function createAllowance(workspaceId: string, a: NewAllowance): { allowance: AllowanceRow; agentKey: string } {
  const id = newId("alw");
  const agentKey = `alw_key_${crypto.randomBytes(24).toString("base64url")}`;
  db()
    .prepare(
      `INSERT INTO allowances (id, workspace_id, name, agent_name, agent_key_hash, agent_key_hint, cap_cents, period,
        per_purchase_cents, categories, merchants_allowed, merchants_blocked, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      id, workspaceId, a.name, a.agentName, hashKey(agentKey), agentKey.slice(-4), a.capCents, a.period,
      a.perPurchaseCents, JSON.stringify(a.categories), JSON.stringify(a.merchantsAllowed ?? []),
      JSON.stringify(a.merchantsBlocked), a.expiresAt, nowIso(),
    );
  return { allowance: getAllowance(id)!, agentKey };
}

export function getAllowance(id: string): AllowanceRow | null {
  const r = db().prepare("SELECT * FROM allowances WHERE id = ?").get(id) as Row | undefined;
  return r ? toAllowance(r) : null;
}

export function allowanceForKey(key: string): AllowanceRow | null {
  if (!key || !key.startsWith("alw_key_")) return null;
  const r = db().prepare("SELECT * FROM allowances WHERE agent_key_hash = ?").get(hashKey(key)) as Row | undefined;
  return r ? toAllowance(r) : null;
}

export function listAllowances(workspaceId: string): AllowanceRow[] {
  return (db().prepare("SELECT * FROM allowances WHERE workspace_id = ? ORDER BY created_at").all(workspaceId) as Row[]).map(
    toAllowance,
  );
}

export function setAllowanceStatus(workspaceId: string, id: string, status: AllowanceStatus): AllowanceRow {
  const res = db().prepare("UPDATE allowances SET status = ? WHERE id = ? AND workspace_id = ?").run(status, id, workspaceId);
  if (res.changes === 0) throw new Error("Allowance not found.");
  if (status === "revoked") {
    db()
      .prepare("UPDATE purchases SET status = 'expired', decided_at = ? WHERE allowance_id = ? AND status = 'held'")
      .run(nowIso(), id);
  }
  return getAllowance(id)!;
}

export function updateAllowanceLimits(
  workspaceId: string,
  id: string,
  limits: { capCents: number; perPurchaseCents: number; categories: string[] },
): AllowanceRow {
  const res = db()
    .prepare("UPDATE allowances SET cap_cents = ?, per_purchase_cents = ?, categories = ? WHERE id = ? AND workspace_id = ?")
    .run(limits.capCents, limits.perPurchaseCents, JSON.stringify(limits.categories), id, workspaceId);
  if (res.changes === 0) throw new Error("Allowance not found.");
  return getAllowance(id)!;
}

function policyView(a: AllowanceRow): PolicyAllowance {
  return {
    status: a.status,
    capCents: a.capCents,
    period: a.period,
    perPurchaseCents: a.perPurchaseCents,
    categories: a.categories,
    merchantsAllowed: a.merchantsAllowed,
    merchantsBlocked: a.merchantsBlocked,
    expiresAt: a.expiresAt,
    createdAt: a.createdAt,
  };
}

function spendHistory(allowanceId: string) {
  return (
    db()
      .prepare("SELECT amount_cents, created_at FROM purchases WHERE allowance_id = ? AND status IN ('completed','charging')")
      .all(allowanceId) as Row[]
  ).map((r) => ({ amountCents: r.amount_cents as number, at: r.created_at as string }));
}

function recentHolds(allowanceId: string) {
  return (
    db()
      .prepare("SELECT merchant_id, created_at FROM purchases WHERE allowance_id = ? AND status IN ('held','declined')")
      .all(allowanceId) as Row[]
  ).map((r) => ({ merchantId: r.merchant_id as string, at: r.created_at as string }));
}

export function summarise(allowanceId: string) {
  const a = getAllowance(allowanceId);
  if (!a) throw new Error("Allowance not found.");
  // Evaluate a 1-cent probe to read the period totals without duplicating the period maths.
  const probe = evaluatePurchase(policyView({ ...a, status: "active", expiresAt: null }), spendHistory(a.id), {
    merchantId: "_probe",
    amountCents: 1,
    category: a.categories[0] ?? "_",
  }, new Date());
  return {
    spentThisPeriodCents: probe.spentThisPeriodCents,
    remainingCents: probe.remainingBeforeCents,
    periodStart: probe.periodStart,
  };
}

// ---------- purchases ----------

export function expireStaleHolds(): void {
  const cutoff = new Date(Date.now() - HOLD_TTL_MS).toISOString();
  db()
    .prepare("UPDATE purchases SET status = 'expired', decided_at = ? WHERE status = 'held' AND created_at < ?")
    .run(nowIso(), cutoff);
}

export function getPurchase(id: string): Purchase | null {
  const r = db().prepare("SELECT * FROM purchases WHERE id = ?").get(id) as Row | undefined;
  return r ? toPurchase(r) : null;
}

export function purchaseForToken(token: string): Purchase | null {
  if (!token) return null;
  const r = db().prepare("SELECT * FROM purchases WHERE approval_token = ?").get(token) as Row | undefined;
  return r ? toPurchase(r) : null;
}

export function listPurchases(workspaceId: string, limit = 200): Purchase[] {
  expireStaleHolds();
  return (
    db().prepare("SELECT * FROM purchases WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?").all(workspaceId, limit) as Row[]
  ).map(toPurchase);
}

async function charge(p: Purchase): Promise<Purchase> {
  const vault = payingVault(p.workspaceId);
  if (!vault) {
    db()
      .prepare("UPDATE purchases SET status = 'failed', error = ? WHERE id = ?")
      .run("Connect PayPal before the agent can pay. Nothing was charged.", p.id);
    return getPurchase(p.id)!;
  }
  try {
    const res = await paypal().charge({
      vaultId: vault.vaultId,
      amountCents: p.amountCents,
      requestId: p.id,
      description: `${p.merchantName} via Allowance`,
      merchantName: p.merchantName,
      lines: p.lines.map((l) => ({ name: l.name, qty: l.qty, unitCents: l.unitCents })),
    });
    const ok = res.status === "COMPLETED";
    db()
      .prepare(
        "UPDATE purchases SET status = ?, paypal_order_id = ?, paypal_capture_id = ?, paypal_status = ?, error = ? WHERE id = ?",
      )
      .run(ok ? "completed" : "failed", res.orderId, res.captureId, res.status, ok ? null : `PayPal returned ${res.status}.`, p.id);
  } catch (err) {
    const pe = err instanceof PayPalError ? err : null;
    const message = pe ? `${pe.message}${pe.issue ? ` (${pe.issue})` : ""}` : "Couldn't reach PayPal. Nothing was charged.";
    db()
      .prepare("UPDATE purchases SET status = 'failed', paypal_debug_id = ?, error = ? WHERE id = ?")
      .run(pe?.debugId ?? null, message, p.id);
  }
  return getPurchase(p.id)!;
}

export interface PurchaseInput {
  allowanceId: string;
  merchantId: string;
  items: { sku: string; qty: number }[];
  note: string;
  runId?: string | null;
}

export async function requestPurchase(input: PurchaseInput): Promise<{ purchase: Purchase; decision: Decision }> {
  const priced = priceBasket(input.merchantId, input.items);
  if (!priced.ok) throw new Error(priced.error);

  // Check and record in one synchronous step, so two purchases can't both squeeze under the cap.
  const { purchase, decision } = tx(() => {
    const a = getAllowance(input.allowanceId);
    if (!a) throw new Error("Allowance not found.");
    expireStaleHolds();
    const decision = evaluatePurchase(
      policyView(a),
      spendHistory(a.id),
      { merchantId: priced.merchant.id, amountCents: priced.totalCents, category: priced.merchant.category },
      new Date(),
      recentHolds(a.id),
    );
    const status: PurchaseStatus = decision.outcome === "allow" ? "charging" : decision.outcome === "hold" ? "held" : "blocked";
    const id = newId("pur");
    db()
      .prepare(
        `INSERT INTO purchases (id, workspace_id, allowance_id, run_id, merchant_id, merchant_name, category, lines, amount_cents,
          agent_note, outcome, status, reasons, approval_token, created_at, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, a.workspaceId, a.id, input.runId ?? null, priced.merchant.id, priced.merchant.name, priced.merchant.category,
        JSON.stringify(priced.lines), priced.totalCents, input.note.slice(0, 500), decision.outcome, status,
        JSON.stringify(decision.reasons), status === "held" ? crypto.randomBytes(24).toString("base64url") : null,
        nowIso(), status === "held" ? null : nowIso(),
      );
    return { purchase: getPurchase(id)!, decision };
  });

  if (purchase.status !== "charging") return { purchase, decision };
  return { purchase: await charge(purchase), decision };
}

/** The owner's answer to a held purchase. Safe to call twice: only the first answer counts. */
export async function decide(token: string, answer: "approve" | "decline"): Promise<Purchase> {
  const claimed = tx(() => {
    expireStaleHolds();
    const p = purchaseForToken(token);
    if (!p) throw new Error("This approval link isn't valid.");
    const a = getAllowance(p.allowanceId)!;
    if (a.status === "revoked") throw new Error("This allowance was revoked, so the agent can't spend from it.");
    if (p.status === "expired") throw new Error("This request expired after 30 minutes without an answer. Nothing was charged.");
    if (p.status !== "held") throw new Error("This request was already answered.");
    const next: PurchaseStatus = answer === "approve" ? "charging" : "declined";
    const res = db()
      .prepare("UPDATE purchases SET status = ?, approved_by_owner = ?, decided_at = ? WHERE id = ? AND status = 'held'")
      .run(next, answer === "approve" ? 1 : 0, nowIso(), p.id);
    if (res.changes !== 1) throw new Error("This request was already answered.");
    return getPurchase(p.id)!;
  });
  if (claimed.status !== "charging") return claimed;
  return charge(claimed);
}

/** Lets the agent wait for the owner's answer. Returns the purchase as soon as it's no longer held. */
export async function waitForDecision(purchaseId: string, timeoutMs: number, pollMs = 500): Promise<Purchase> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const p = getPurchase(purchaseId)!;
    if (p.status !== "held" && p.status !== "charging") return p;
    if (Date.now() > deadline) return p;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
