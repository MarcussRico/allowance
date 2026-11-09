/**
 * The spending rules for an allowance. Pure: no database, no network, no clock
 * except the `now` passed in. Everything that decides whether an agent may
 * spend lives here, so it can be tested exhaustively.
 */

export type Period = "day" | "week" | "month";
export type AllowanceStatus = "active" | "paused" | "revoked";

export interface Allowance {
  status: AllowanceStatus;
  /** Most the agent may spend in one period, in cents. */
  capCents: number;
  period: Period;
  /** Most a single purchase may cost before it needs the owner, in cents. */
  perPurchaseCents: number;
  /** Categories the agent may buy in without asking. */
  categories: string[];
  /** If non-empty, only these merchants are allowed without asking. */
  merchantsAllowed: string[];
  /** Merchants the agent may never buy from. */
  merchantsBlocked: string[];
  expiresAt: string | null;
  createdAt: string;
}

/** A purchase that already went through and counts against the cap. */
export interface PastSpend {
  amountCents: number;
  at: string;
}

/** A purchase that was held for the owner or declined by them. */
export interface RecentHold {
  merchantId: string;
  at: string;
}

/** How long a held or declined purchase makes follow-ups at the same shop wait too. */
export const SPLIT_WINDOW_MS = 15 * 60 * 1000;

export interface PurchaseRequest {
  merchantId: string;
  amountCents: number;
  category: string;
}

/**
 * allow - the agent can spend now.
 * hold  - outside the limits, but the owner can approve it.
 * block - not allowed, and not something to ask the owner about.
 */
export type Outcome = "allow" | "hold" | "block";

export interface Decision {
  outcome: Outcome;
  /** Plain-English reasons, written for the owner. Empty when allowed. */
  reasons: string[];
  spentThisPeriodCents: number;
  remainingBeforeCents: number;
  remainingAfterCents: number;
  periodStart: string;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

const PERIOD_NAME: Record<Period, string> = { day: "today's", week: "this week's", month: "this month's" };

/** Start of the period containing `now`, in UTC. Weeks start on Monday. */
export function periodStart(period: Period, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "week") {
    const daysSinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  } else if (period === "month") {
    d.setUTCDate(1);
  }
  return d;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function evaluatePurchase(
  allowance: Allowance,
  history: PastSpend[],
  req: PurchaseRequest,
  now: Date,
  recentHolds: RecentHold[] = [],
): Decision {
  const start = periodStart(allowance.period, now);
  const spent = history
    .filter((h) => new Date(h.at).getTime() >= start.getTime() && new Date(h.at).getTime() <= now.getTime())
    .reduce((sum, h) => sum + h.amountCents, 0);
  const remainingBefore = Math.max(0, allowance.capCents - spent);

  const base = {
    spentThisPeriodCents: spent,
    remainingBeforeCents: remainingBefore,
    periodStart: start.toISOString(),
  };
  const block = (reason: string): Decision => ({
    ...base,
    outcome: "block",
    reasons: [reason],
    remainingAfterCents: remainingBefore,
  });

  // Hard stops: nothing the owner should be pinged about.
  if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) return block("The amount must be more than $0.00.");
  if (allowance.status === "revoked") return block("This allowance was revoked.");
  if (allowance.status === "paused") return block("This allowance is paused.");
  if (allowance.expiresAt && new Date(allowance.expiresAt).getTime() < now.getTime()) {
    return block(`This allowance expired on ${formatDate(allowance.expiresAt)}.`);
  }
  if (allowance.merchantsBlocked.includes(req.merchantId)) return block("You've blocked this merchant.");

  // Soft limits: the owner can approve past these.
  const reasons: string[] = [];
  if (!allowance.categories.includes(req.category)) {
    reasons.push(
      `${capitalise(req.category)} isn't one of this allowance's categories (${allowance.categories.join(", ")}).`,
    );
  }
  if (allowance.merchantsAllowed.length > 0 && !allowance.merchantsAllowed.includes(req.merchantId)) {
    reasons.push("This merchant isn't on the allowance's list of approved shops.");
  }
  if (req.amountCents > allowance.perPurchaseCents) {
    reasons.push(
      `${formatCents(req.amountCents)} is over the ${formatCents(allowance.perPurchaseCents)} limit for a single purchase.`,
    );
  }
  const splitting = recentHolds.some(
    (h) => h.merchantId === req.merchantId && now.getTime() - new Date(h.at).getTime() <= SPLIT_WINDOW_MS,
  );
  if (splitting) {
    reasons.push(
      "A purchase at this shop is waiting for you or was declined in the last 15 minutes, so smaller follow-ups wait too. This stops a held purchase being split into small ones.",
    );
  }
  if (req.amountCents > remainingBefore) {
    reasons.push(
      `${formatCents(req.amountCents)} would go past ${PERIOD_NAME[allowance.period]} ${formatCents(allowance.capCents)} cap. ${formatCents(remainingBefore)} is left.`,
    );
  }

  return {
    ...base,
    outcome: reasons.length === 0 ? "allow" : "hold",
    reasons,
    remainingAfterCents: reasons.length === 0 ? remainingBefore - req.amountCents : remainingBefore,
  };
}
