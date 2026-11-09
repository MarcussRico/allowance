import { z } from "zod";
import { json, parseBody, problem } from "@/lib/http";
import { currentWorkspaceId } from "@/lib/session";
import { setAllowanceStatus, updateAllowanceLimits } from "@/lib/store";

const Patch = z.union([
  z.object({ status: z.enum(["active", "paused", "revoked"]) }),
  z.object({
    capCents: z.number().int().min(100).max(100_000),
    perPurchaseCents: z.number().int().min(100).max(100_000),
    categories: z.array(z.string().min(1).max(30)).min(1).max(10),
  }),
]);

export async function PATCH(req: Request, ctx: RouteContext<"/api/allowances/[id]">) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const body = await parseBody(req, Patch);
  if (body instanceof Response) return body;
  try {
    if ("status" in body) return json({ allowance: setAllowanceStatus(ws, id, body.status) });
    return json({ allowance: updateAllowanceLimits(ws, id, body) });
  } catch {
    return problem(404, "Allowance not found.");
  }
}
