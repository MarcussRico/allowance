import { clientIp, problem, rateLimited } from "./http";
import { allowanceForKey, type AllowanceRow } from "./store";

/** Agents authenticate with their Allowance key: `Authorization: Bearer alw_key_...`. */
export function authenticateAgent(req: Request): AllowanceRow | Response {
  if (rateLimited(`agent:${clientIp(req)}`, 120, 60_000)) return problem(429, "Too many requests. Slow down.");
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const allowance = allowanceForKey(key);
  if (!allowance) return problem(401, "Send a valid Allowance key as `Authorization: Bearer alw_key_...`.");
  return allowance;
}
