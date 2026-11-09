import { z } from "zod";
import { clientIp, json, parseBody, problem, rateLimited } from "@/lib/http";
import { decide, getAllowance, purchaseForToken } from "@/lib/store";

/**
 * The approval link is the credential: 192 random bits, single-use, expires in
 * 30 minutes. That lets the owner answer from a phone without signing in.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/approvals/[token]">) {
  if (rateLimited(`approve:${clientIp(req)}`, 60, 60_000)) return problem(429, "Too many requests.");
  const { token } = await ctx.params;
  const p = purchaseForToken(token);
  if (!p) return problem(404, "This approval link isn't valid.");
  const a = getAllowance(p.allowanceId)!;
  const { approvalToken: _omit, ...purchase } = p;
  return json({ purchase, allowance: { name: a.name, agentName: a.agentName, status: a.status } });
}

const Answer = z.object({ answer: z.enum(["approve", "decline"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[token]">) {
  if (rateLimited(`approve:${clientIp(req)}`, 60, 60_000)) return problem(429, "Too many requests.");
  const { token } = await ctx.params;
  const body = await parseBody(req, Answer);
  if (body instanceof Response) return body;
  try {
    const { approvalToken: _omit, ...purchase } = await decide(token, body.answer);
    return json({ purchase });
  } catch (err) {
    return problem(409, err instanceof Error ? err.message : "This request couldn't be answered.");
  }
}
