import { cookies } from "next/headers";
import { clientIp, json, problem, rateLimited } from "@/lib/http";
import { seedWorkspace, WORKSPACE_COOKIE } from "@/lib/session";
import crypto from "node:crypto";

/** Starts a fresh demo workspace for this browser. The old one is left untouched. */
export async function POST(req: Request) {
  if (rateLimited(`reset:${clientIp(req)}`, 6, 60 * 60 * 1000)) return problem(429, "Too many fresh workspaces from here. Try again later.");
  const id = `ws_${crypto.randomBytes(15).toString("base64url")}`;
  seedWorkspace(id);
  (await cookies()).set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return json({ ok: true });
}
