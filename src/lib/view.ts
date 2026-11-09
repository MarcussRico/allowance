import { latestRun, runEvents } from "./agent";
import { paypal } from "./paypal";
import { getWorkspace, listAllowances, listPurchases, payingVault, summarise } from "./store";

/** Everything the dashboard shows, in one read. */
export function dashboardState(workspaceId: string) {
  const ws = getWorkspace(workspaceId)!;
  const vault = payingVault(workspaceId);
  const run = latestRun(workspaceId);
  return {
    paypalMode: paypal().mode,
    agentMode: process.env.ANTHROPIC_API_KEY ? "claude" : "scripted",
    paypalAccount: ws.vaultId ? { email: ws.payerEmail, shared: false } : vault ? { email: null, shared: true } : null,
    runsLeft: Math.max(0, runLimitPerWorkspace() - ws.runsUsed),
    allowances: listAllowances(workspaceId).map((a) => ({ ...a, ...summarise(a.id) })),
    purchases: listPurchases(workspaceId).map(({ approvalToken, ...p }) => ({
      ...p,
      approvalPath: p.status === "held" && approvalToken ? `/approve/${approvalToken}` : null,
    })),
    run: run ? { ...run, events: runEvents(run.id) } : null,
  };
}

export type DashboardState = ReturnType<typeof dashboardState>;

export function runLimitPerWorkspace(): number {
  return Number(process.env.RUNS_PER_WORKSPACE ?? 8);
}
