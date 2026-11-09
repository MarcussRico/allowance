import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { currentWorkspaceId } from "@/lib/session";
import { dashboardState } from "@/lib/view";

async function Board({ searchParams }: { searchParams: PageProps<"/app">["searchParams"] }) {
  const ws = await currentWorkspaceId();
  const params = await searchParams;
  const notice = typeof params.paypal === "string" ? params.paypal : null;
  return <Dashboard initial={dashboardState(ws)} notice={notice} />;
}

export default function Home({ searchParams }: PageProps<"/app">) {
  return (
    <Suspense fallback={<p className="boot">Opening your allowances…</p>}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
