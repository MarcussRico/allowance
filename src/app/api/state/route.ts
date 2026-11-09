import { currentWorkspaceId } from "@/lib/session";
import { json } from "@/lib/http";
import { dashboardState } from "@/lib/view";

export async function GET() {
  return json(dashboardState(await currentWorkspaceId()));
}
