import { authenticateAgent } from "@/lib/agent-auth";
import { agentPurchaseView } from "@/lib/agent-view";
import { json, problem } from "@/lib/http";
import { getPurchase } from "@/lib/store";

export async function GET(req: Request, ctx: RouteContext<"/api/agent/purchases/[id]">) {
  const a = authenticateAgent(req);
  if (a instanceof Response) return a;
  const { id } = await ctx.params;
  const p = getPurchase(id);
  if (!p || p.allowanceId !== a.id) return problem(404, "Purchase not found.");
  return json(agentPurchaseView(p));
}
