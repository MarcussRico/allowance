import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "alw_ws";
const ID_PATTERN = /^ws_[A-Za-z0-9_-]{12,40}$/;

function newWorkspaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `ws_${b64}`;
}

/** Give each visitor a workspace cookie on their first request, visible to that same request. */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value;
  if (existing && ID_PATTERN.test(existing)) return NextResponse.next();

  const id = newWorkspaceId();
  request.cookies.set(COOKIE, id);
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  // Agent API calls authenticate with an agent key, not a browser cookie.
  matcher: ["/((?!_next/|api/agent/|favicon.ico|.*\\.(?:svg|png|jpg|ico|woff2?)$).*)"],
};
