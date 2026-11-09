import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { SimulatedGateway, setPayPalForTests } from "./paypal";
import {
  allowanceForKey,
  connectVault,
  createAllowance,
  createWorkspace,
  decide,
  listPurchases,
  requestPurchase,
  setAllowanceStatus,
  summarise,
} from "./store";

let gw: SimulatedGateway;
let ws: string;
let allowanceId: string;
let agentKey: string;

beforeEach(() => {
  process.env.ALLOWANCE_DB = ":memory:";
  resetDbForTests();
  gw = new SimulatedGateway();
  setPayPalForTests(gw);
  ws = createWorkspace("Sai");
  connectVault(ws, "VAULT-TEST-1", "sai@example.com");
  const created = createAllowance(ws, {
    name: "Weekly groceries and books",
    agentName: "Household agent",
    capCents: 4000,
    period: "week",
    perPurchaseCents: 2500,
    categories: ["groceries", "books"],
    merchantsBlocked: ["luckyline"],
    expiresAt: null,
  });
  allowanceId = created.allowance.id;
  agentKey = created.agentKey;
});

describe("purchase flow", () => {
  it("charges PayPal with the catalog price, not anything the agent says, and records the order", async () => {
    const r = await requestPurchase({
      allowanceId,
      merchantId: "corner-grocer",
      items: [
        { sku: "oat-milk-1l", qty: 2 },
        { sku: "eggs-12", qty: 1 },
      ],
      note: "weekly restock",
    });
    expect(r.purchase.status).toBe("completed");
    expect(r.purchase.amountCents).toBe(349 * 2 + 429);
    expect(gw.charges).toHaveLength(1);
    expect(gw.charges[0]).toMatchObject({ vaultId: "VAULT-TEST-1", amountCents: 1127, requestId: r.purchase.id });
    expect(r.purchase.paypalOrderId).toMatch(/^SIM/);
    expect(summarise(allowanceId).spentThisPeriodCents).toBe(1127);
  });

  it("holds an out-of-policy purchase without charging, then charges when the owner approves", async () => {
    const r = await requestPurchase({ allowanceId, merchantId: "voltline", items: [{ sku: "nc-headphones", qty: 1 }], note: "" });
    expect(r.purchase.status).toBe("held");
    expect(gw.charges).toHaveLength(0);
    expect(r.purchase.approvalToken).toBeTruthy();

    const approved = await decide(r.purchase.approvalToken!, "approve");
    expect(approved.status).toBe("completed");
    expect(approved.approvedByOwner).toBe(true);
    expect(gw.charges).toHaveLength(1);
    expect(gw.charges[0].amountCents).toBe(8900);
  });

  it("charges an approved purchase exactly once, even if approve is pressed twice", async () => {
    const r = await requestPurchase({ allowanceId, merchantId: "voltline", items: [{ sku: "nc-headphones", qty: 1 }], note: "" });
    const token = r.purchase.approvalToken!;
    await Promise.all([decide(token, "approve"), decide(token, "approve").catch(() => null)]);
    await decide(token, "approve").catch(() => null);
    expect(gw.charges).toHaveLength(1);
  });

  it("doesn't charge a declined purchase, and holds a split follow-up at the same shop", async () => {
    const r = await requestPurchase({ allowanceId, merchantId: "voltline", items: [{ sku: "nc-headphones", qty: 1 }], note: "" });
    const declined = await decide(r.purchase.approvalToken!, "decline");
    expect(declined.status).toBe("declined");

    // Make electronics allowed so only the split rule can hold the follow-up.
    const again = createAllowance(ws, {
      name: "x", agentName: "x", capCents: 10000, period: "week", perPurchaseCents: 10000,
      categories: ["electronics"], merchantsBlocked: [], expiresAt: null,
    });
    const r1 = await requestPurchase({ allowanceId: again.allowance.id, merchantId: "voltline", items: [{ sku: "hdmi-2m", qty: 1 }], note: "" });
    expect(r1.purchase.status).toBe("completed"); // separate allowance, no history at that shop

    const r2 = await requestPurchase({ allowanceId, merchantId: "voltline", items: [{ sku: "hdmi-2m", qty: 1 }], note: "" });
    expect(r2.purchase.status).toBe("held");
    expect(r2.decision.reasons.some((x) => x.includes("split"))).toBe(true);
    expect(gw.charges).toHaveLength(1);
  });

  it("blocks a blocked merchant with no approval link", async () => {
    const r = await requestPurchase({ allowanceId, merchantId: "luckyline", items: [{ sku: "bet-credit-20", qty: 1 }], note: "" });
    expect(r.purchase.status).toBe("blocked");
    expect(r.purchase.approvalToken).toBeNull();
    expect(gw.charges).toHaveLength(0);
  });

  it("records a PayPal failure with its debug id and doesn't count it as spend", async () => {
    gw.failNext = "INSTRUMENT_DECLINED";
    const r = await requestPurchase({ allowanceId, merchantId: "corner-grocer", items: [{ sku: "bananas", qty: 1 }], note: "" });
    expect(r.purchase.status).toBe("failed");
    expect(r.purchase.paypalDebugId).toBe("SIM-DEBUG");
    expect(r.purchase.error).toContain("INSTRUMENT_DECLINED");
    expect(summarise(allowanceId).spentThisPeriodCents).toBe(0);
  });

  it("blocks everything once revoked, including a purchase that was already waiting", async () => {
    const held = await requestPurchase({ allowanceId, merchantId: "voltline", items: [{ sku: "nc-headphones", qty: 1 }], note: "" });
    setAllowanceStatus(ws, allowanceId, "revoked");
    await expect(decide(held.purchase.approvalToken!, "approve")).rejects.toThrow(/revoked/);
    const r = await requestPurchase({ allowanceId, merchantId: "corner-grocer", items: [{ sku: "bananas", qty: 1 }], note: "" });
    expect(r.purchase.status).toBe("blocked");
    expect(gw.charges).toHaveLength(0);
  });

  it("rejects unknown items instead of guessing a price", async () => {
    await expect(
      requestPurchase({ allowanceId, merchantId: "corner-grocer", items: [{ sku: "caviar", qty: 1 }], note: "" }),
    ).rejects.toThrow(/doesn't sell/);
    expect(listPurchases(ws)).toHaveLength(0);
  });

  it("finds the allowance from the agent's key, and nothing from a wrong key", () => {
    expect(allowanceForKey(agentKey)?.id).toBe(allowanceId);
    expect(allowanceForKey(agentKey + "x")).toBeNull();
    expect(allowanceForKey("")).toBeNull();
  });

  it("can't touch another workspace's allowance", () => {
    const other = createWorkspace("Someone else");
    expect(() => setAllowanceStatus(other, allowanceId, "revoked")).toThrow(/not found/i);
  });

  it("fails clearly when no PayPal account is connected", async () => {
    const lonely = createWorkspace("No vault");
    const a = createAllowance(lonely, {
      name: "x", agentName: "x", capCents: 4000, period: "week", perPurchaseCents: 2500,
      categories: ["groceries"], merchantsBlocked: [], expiresAt: null,
    });
    const prev = process.env.DEMO_VAULT_ID;
    delete process.env.DEMO_VAULT_ID;
    const r = await requestPurchase({ allowanceId: a.allowance.id, merchantId: "corner-grocer", items: [{ sku: "bananas", qty: 1 }], note: "" });
    process.env.DEMO_VAULT_ID = prev;
    expect(r.purchase.status).toBe("failed");
    expect(r.purchase.error).toMatch(/Connect PayPal/);
  });
});
