import { authenticateAgent } from "@/lib/agent-auth";
import { json } from "@/lib/http";
import { summarise } from "@/lib/store";

export async function GET(req: Request) {
  const a = authenticateAgent(req);
  if (a instanceof Response) return a;
  const s = summarise(a.id);
  return json({
    name: a.name,
    status: a.status,
    period: a.period,
    capCents: a.capCents,
    perPurchaseCents: a.perPurchaseCents,
    categories: a.categories,
    expiresAt: a.expiresAt,
    spentThisPeriodCents: s.spentThisPeriodCents,
    remainingCents: s.remainingCents,
  });
}
