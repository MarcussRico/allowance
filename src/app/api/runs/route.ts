import { z } from "zod";
import { latestRun, runsInLastDay, startRun } from "@/lib/agent";
import { clientIp, json, parseBody, problem, rateLimited } from "@/lib/http";
import { currentWorkspaceId } from "@/lib/session";
import { getAllowance, getWorkspace } from "@/lib/store";
import { runLimitPerWorkspace } from "@/lib/view";

const NewRun = z.object({
  allowanceId: z.string().min(1),
  task: z.string().trim().min(3).max(600),
});

export async function POST(req: Request) {
  const ws = await currentWorkspaceId();
  const body = await parseBody(req, NewRun);
  if (body instanceof Response) return body;

  const allowance = getAllowance(body.allowanceId);
  if (!allowance || allowance.workspaceId !== ws) return problem(404, "Allowance not found.");
  if (latestRun(ws)?.status === "running") return problem(409, "The agent is already working on a task. Wait for it to finish.");
  if (getWorkspace(ws)!.runsUsed >= runLimitPerWorkspace()) {
    return problem(429, "This demo workspace has used all its agent runs. Start a fresh workspace to try again.");
  }
  if (rateLimited(`runs:${clientIp(req)}`, 20, 60 * 60 * 1000)) return problem(429, "Too many agent runs from here. Try again later.");
  if (runsInLastDay() >= Number(process.env.MAX_RUNS_PER_DAY ?? 300)) {
    return problem(429, "The demo has hit today's limit for agent runs. Try again tomorrow, or run it locally.");
  }

  return json(startRun(ws, allowance.id, body.task), 202);
}
