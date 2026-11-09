import { cookies } from "next/headers";
import { connectVault, createAllowance, createWorkspace, getWorkspace } from "./store";
import { paypal } from "./paypal";

export const WORKSPACE_COOKIE = "alw_ws";
const ID_PATTERN = /^ws_[A-Za-z0-9_-]{12,40}$/;

export function isWorkspaceId(id: string | undefined): id is string {
  return !!id && ID_PATTERN.test(id);
}

/** Every new workspace starts with one allowance, so the demo works on first load. */
export function seedWorkspace(id: string): void {
  createWorkspace("You", id);
  if (paypal().mode === "simulated") connectVault(id, "SIM-VAULT-DEMO", "sb-buyer@personal.example.com");
  const week = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  week.setUTCHours(23, 59, 0, 0);
  createAllowance(id, {
    name: "Weekly groceries and books",
    agentName: "Household agent",
    capCents: 6000,
    period: "week",
    perPurchaseCents: 3000,
    categories: ["groceries", "books"],
    merchantsBlocked: ["luckyline"],
    expiresAt: week.toISOString(),
  });
}

/** The visitor's workspace. The proxy guarantees the cookie; this creates the rows on first use. */
export async function currentWorkspaceId(): Promise<string> {
  const id = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!isWorkspaceId(id)) throw new Error("Missing workspace cookie.");
  if (!getWorkspace(id)) seedWorkspace(id);
  return id;
}
