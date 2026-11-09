import { describe, expect, it } from "vitest";
import { evaluatePurchase, type Allowance, type PastSpend, type PurchaseRequest } from "./policy";

const NOW = new Date("2026-11-11T10:00:00Z");

function allowance(overrides: Partial<Allowance> = {}): Allowance {
  return {
    status: "active",
    capCents: 4000, // $40 per period
    period: "week",
    perPurchaseCents: 2500, // $25 per purchase
    categories: ["groceries", "books"],
    merchantsAllowed: [],
    merchantsBlocked: [],
    expiresAt: "2026-11-14T23:59:59Z",
    createdAt: "2026-11-09T00:00:00Z",
    ...overrides,
  };
}

function request(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return { merchantId: "corner-grocer", amountCents: 1240, category: "groceries", ...overrides };
}

describe("evaluatePurchase", () => {
  it("allows a purchase inside every limit", () => {
    const d = evaluatePurchase(allowance(), [], request(), NOW);
    expect(d.outcome).toBe("allow");
    expect(d.remainingAfterCents).toBe(2760);
  });

  it("holds a purchase in a category the allowance doesn't cover", () => {
    const d = evaluatePurchase(allowance(), [], request({ category: "electronics", amountCents: 900 }), NOW);
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toContain("Electronics isn't one of this allowance's categories (groceries, books).");
  });

  it("holds a single purchase above the per-purchase limit", () => {
    const d = evaluatePurchase(allowance(), [], request({ amountCents: 3100 }), NOW);
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toContain("$31.00 is over the $25.00 limit for a single purchase.");
  });

  it("holds a purchase that would take the period over its cap, counting earlier spend", () => {
    const history: PastSpend[] = [
      { amountCents: 2000, at: "2026-11-10T09:00:00Z" },
      { amountCents: 1500, at: "2026-11-11T08:00:00Z" },
    ];
    const d = evaluatePurchase(allowance(), history, request({ amountCents: 900 }), NOW);
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toContain("$9.00 would go past this week's $40.00 cap. $5.00 is left.");
  });

  it("only counts spend from the current period", () => {
    // Weekly periods start Monday 00:00 UTC. 2026-11-11 is a Wednesday, so the week began 2026-11-09.
    const history: PastSpend[] = [{ amountCents: 3900, at: "2026-11-08T23:00:00Z" }];
    const d = evaluatePurchase(allowance({ createdAt: "2026-11-01T00:00:00Z" }), history, request(), NOW);
    expect(d.outcome).toBe("allow");
    expect(d.spentThisPeriodCents).toBe(0);
  });

  it("allows a purchase that lands exactly on the cap", () => {
    const history: PastSpend[] = [{ amountCents: 2760, at: "2026-11-10T09:00:00Z" }];
    const d = evaluatePurchase(allowance(), history, request({ amountCents: 1240 }), NOW);
    expect(d.outcome).toBe("allow");
    expect(d.remainingAfterCents).toBe(0);
  });

  it("blocks outright at a merchant the owner has blocked, even inside limits", () => {
    const d = evaluatePurchase(allowance({ merchantsBlocked: ["corner-grocer"] }), [], request(), NOW);
    expect(d.outcome).toBe("block");
    expect(d.reasons).toEqual(["You've blocked this merchant."]);
  });

  it("holds a merchant outside a non-empty allow list", () => {
    const d = evaluatePurchase(allowance({ merchantsAllowed: ["paper-lantern"] }), [], request(), NOW);
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toContain("This merchant isn't on the allowance's list of approved shops.");
  });

  it("blocks every purchase once the allowance is revoked", () => {
    const d = evaluatePurchase(allowance({ status: "revoked" }), [], request(), NOW);
    expect(d.outcome).toBe("block");
    expect(d.reasons).toEqual(["This allowance was revoked."]);
  });

  it("blocks while the allowance is paused", () => {
    const d = evaluatePurchase(allowance({ status: "paused" }), [], request(), NOW);
    expect(d.outcome).toBe("block");
    expect(d.reasons).toEqual(["This allowance is paused."]);
  });

  it("blocks after the allowance has expired", () => {
    const d = evaluatePurchase(allowance({ expiresAt: "2026-11-10T00:00:00Z" }), [], request(), NOW);
    expect(d.outcome).toBe("block");
    expect(d.reasons).toEqual(["This allowance expired on 10 Nov 2026."]);
  });

  it("rejects amounts that aren't a positive whole number of cents", () => {
    for (const amountCents of [0, -500, 12.5, Number.NaN]) {
      const d = evaluatePurchase(allowance(), [], request({ amountCents }), NOW);
      expect(d.outcome).toBe("block");
      expect(d.reasons).toEqual(["The amount must be more than $0.00."]);
    }
  });

  it("lists every reason when several limits are broken at once", () => {
    const d = evaluatePurchase(allowance(), [], request({ category: "electronics", amountCents: 8900 }), NOW);
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toHaveLength(3);
  });

  it("holds follow-up purchases at a shop where a purchase is waiting or was declined, so limits can't be dodged by splitting", () => {
    const recent = [{ merchantId: "voltline", at: "2026-11-11T09:55:00Z" }];
    const d = evaluatePurchase(
      allowance({ categories: ["groceries", "books", "electronics"] }),
      [],
      request({ merchantId: "voltline", category: "electronics", amountCents: 2200 }),
      NOW,
      recent,
    );
    expect(d.outcome).toBe("hold");
    expect(d.reasons).toEqual([
      "A purchase at this shop is waiting for you or was declined in the last 15 minutes, so smaller follow-ups wait too. This stops a held purchase being split into small ones.",
    ]);
  });

  it("stops holding follow-ups 15 minutes after the held purchase", () => {
    const recent = [{ merchantId: "corner-grocer", at: "2026-11-11T09:44:00Z" }];
    const d = evaluatePurchase(allowance(), [], request(), NOW, recent);
    expect(d.outcome).toBe("allow");
  });

  it("uses daily and monthly periods", () => {
    const history: PastSpend[] = [
      { amountCents: 3000, at: "2026-11-11T01:00:00Z" },
      { amountCents: 3000, at: "2026-11-02T01:00:00Z" },
    ];
    const daily = evaluatePurchase(allowance({ period: "day" }), history, request({ amountCents: 1000 }), NOW);
    expect(daily.spentThisPeriodCents).toBe(3000);
    const monthly = evaluatePurchase(allowance({ period: "month", capCents: 10000 }), history, request({ amountCents: 1000 }), NOW);
    expect(monthly.spentThisPeriodCents).toBe(6000);
    expect(monthly.outcome).toBe("allow");
  });
});
