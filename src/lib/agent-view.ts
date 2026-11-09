import type { Purchase } from "./store";

/** What an agent is told about a purchase. No approval link: that belongs to the owner. */
export function agentPurchaseView(p: Purchase) {
  return {
    id: p.id,
    status: p.status,
    shop: p.merchantName,
    amountCents: p.amountCents,
    lines: p.lines,
    reasons: p.reasons,
    approvedByOwner: p.approvedByOwner,
    paypalOrderId: p.paypalOrderId,
    error: p.error,
    next:
      p.status === "held"
        ? "Waiting for the owner. Poll GET /api/agent/purchases/{id} until the status changes. Don't retry or split it."
        : null,
  };
}
