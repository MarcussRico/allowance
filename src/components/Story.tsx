"use client";

import type { DashboardState } from "@/lib/view";
import { clock } from "./format";
import { Slip, type PurchaseView } from "./Slip";

type Run = NonNullable<DashboardState["run"]>;
type RunEvent = Run["events"][number];

type Entry =
  | { type: "step"; e: RunEvent }
  | { type: "slip"; e: RunEvent; p: PurchaseView }
  | { type: "say"; e: RunEvent }
  | { type: "problem"; e: RunEvent };

const ANSWER: Record<string, string> = {
  completed: "You approved it, and PayPal was charged.",
  declined: "You declined it. The agent left it.",
  expired: "Nobody answered, so it expired. Nothing was charged.",
  failed: "You approved it, but PayPal didn't complete it.",
  held: "Still waiting for your answer.",
};

/** What the agent did, in order. Purchases are slips; everything else is a quiet line. */
export function Story({ run, purchases }: { run: DashboardState["run"]; purchases: PurchaseView[] }) {
  if (!run) {
    return (
      <section className="story" aria-labelledby="story-title">
        <h2 id="story-title" className="section-title">
          What the agent did
        </h2>
        <p className="story__empty">Nothing yet. Send it a task above and every step lands here, purchases as slips.</p>
      </section>
    );
  }

  const byId = new Map(purchases.map((p) => [p.id, p]));
  const entries: Entry[] = [];
  const slipShown = new Set<string>();
  for (const e of run.events) {
    if (e.kind === "start" || e.kind === "done") continue;
    const pid = e.data?.purchaseId as string | undefined;
    const p = pid ? byId.get(pid) : undefined;
    if ((e.kind === "purchase" || e.kind === "waiting") && p && !slipShown.has(p.id)) {
      slipShown.add(p.id);
      entries.push({ type: "slip", e, p });
    } else if (e.kind === "decision" && p) {
      entries.push({ type: "step", e: { ...e, text: ANSWER[p.status] ?? e.text } });
    } else if (e.kind === "say") {
      entries.push({ type: "say", e });
    } else if (e.kind === "error") {
      entries.push({ type: "problem", e });
    } else {
      entries.push({ type: "step", e });
    }
  }

  return (
    <section className="story" aria-labelledby="story-title">
      <h2 id="story-title" className="section-title">
        What the agent did
      </h2>
      <p className="story__task">
        <span>Task</span> {run.task}
      </p>
      <ol className="story__list" aria-live="polite" aria-relevant="additions">
        {entries.map((entry) => (
          <li key={entry.e.seq} className={`story__entry story__entry--${entry.type} story__kind--${entry.e.kind}`}>
            <time className="story__time num">{clock(entry.e.at)}</time>
            {entry.type === "slip" ? (
              <Slip p={entry.p} />
            ) : entry.type === "say" ? (
              <blockquote className="story__say">{entry.e.text}</blockquote>
            ) : (
              <p className="story__step">{entry.e.text}</p>
            )}
          </li>
        ))}
      </ol>
      {run.status === "running" && <p className="story__working">The agent is working</p>}
    </section>
  );
}
