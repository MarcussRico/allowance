import { z } from "zod";
import { MERCHANTS } from "@/lib/catalog";
import { json, parseBody } from "@/lib/http";
import { currentWorkspaceId } from "@/lib/session";
import { createAllowance } from "@/lib/store";

const categories = [...new Set(MERCHANTS.map((m) => m.category))] as [string, ...string[]];

const NewAllowance = z.object({
  name: z.string().trim().min(1).max(60),
  agentName: z.string().trim().min(1).max(40),
  capCents: z.number().int().min(100).max(100_000),
  period: z.enum(["day", "week", "month"]),
  perPurchaseCents: z.number().int().min(100).max(100_000),
  categories: z.array(z.enum(categories)).min(1),
  expiresInDays: z.number().int().min(1).max(90).nullable(),
});

/** Creates an allowance and returns its agent key. The key is shown once and never stored in plain text. */
export async function POST(req: Request) {
  const ws = await currentWorkspaceId();
  const body = await parseBody(req, NewAllowance);
  if (body instanceof Response) return body;
  const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null;
  const { allowance, agentKey } = createAllowance(ws, {
    name: body.name,
    agentName: body.agentName,
    capCents: body.capCents,
    period: body.period,
    perPurchaseCents: Math.min(body.perPurchaseCents, body.capCents),
    categories: body.categories,
    merchantsBlocked: ["luckyline"],
    expiresAt,
  });
  return json({ allowance, agentKey }, 201);
}
