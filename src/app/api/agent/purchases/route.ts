import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { agentPurchaseView } from "@/lib/agent-view";
import { json, parseBody, problem } from "@/lib/http";
import { requestPurchase } from "@/lib/store";

const Buy = z.object({
  shopId: z.string().min(1).max(60),
  items: z.array(z.object({ sku: z.string().min(1).max(60), qty: z.number().int().min(1).max(20) })).min(1).max(20),
  reason: z.string().max(500).default(""),
});

export async function POST(req: Request) {
  const a = authenticateAgent(req);
  if (a instanceof Response) return a;
  const body = await parseBody(req, Buy);
  if (body instanceof Response) return body;
  try {
    const { purchase } = await requestPurchase({ allowanceId: a.id, merchantId: body.shopId, items: body.items, note: body.reason });
    return json(agentPurchaseView(purchase), purchase.status === "held" ? 202 : 200);
  } catch (err) {
    return problem(422, err instanceof Error ? err.message : "That purchase couldn't be made.");
  }
}
