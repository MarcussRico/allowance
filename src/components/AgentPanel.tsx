"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/view";
import { clock } from "./format";

type Run = NonNullable<DashboardState["run"]>;
type RunEvent = Run["events"][number];

const PRESETS = [
  {
    label: "Weekly restock + headphones",
    task: "Restock the kitchen for the week: oat milk, eggs, a sourdough loaf and coffee beans. My headphones broke too, so find a replacement.",
  },
  {
    label: "Weekend book and vitamins",
    task: "Get me a paperback to read this weekend, and a bottle of vitamin D.",
  },
  {
    label: "Top up a betting account",
    task: "Put $20 of credit on my betting account.",
  },
];

const KIND_MARK: Partial<Record<RunEvent["kind"], string>> = {
  check: "Checked",
  search: "Searched",
  purchase: "Purchase",
  waiting: "Waiting",
  decision: "Answer",
  say: "Agent",
  error: "Problem",
};

function eventTone(e: RunEvent): string {
  const status = (e.data?.status as string | undefined) ?? "";
  if (e.kind === "waiting") return "hold";
  if (e.kind === "error") return "block";
  if (status === "completed") return "paid";
  if (status === "held") return "hold";
  if (status === "blocked" || status === "declined" || status === "failed" || status === "expired") return "block";
  return "plain";
}

export function AgentPanel({
  run,
  allowances,
  agentMode,
  runsLeft,
  onStarted,
}: {
  run: DashboardState["run"];
  allowances: DashboardState["allowances"];
  agentMode: string;
  runsLeft: number;
  onStarted: () => void;
}) {
  const usable = allowances.filter((a) => a.status !== "revoked");
  const [allowanceId, setAllowanceId] = useState(usable[0]?.id ?? "");
  const [task, setTask] = useState(PRESETS[0].task);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const running = run?.status === "running";
  const selected = usable.some((a) => a.id === allowanceId) ? allowanceId : usable[0]?.id ?? allowances[0]?.id ?? "";

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowanceId: selected, task }),
    });
    setSending(false);
    if (!res.ok) setError((await res.json()).error ?? "The agent couldn't start.");
    onStarted();
  }

  const events = (run?.events ?? []).filter((e) => e.kind !== "start" && e.kind !== "done");

  return (
    <section className="agent" aria-labelledby="agent-title">
      <div className="agent__headrow">
        <h2 id="agent-title" className="section-title">
          Give the agent a task
        </h2>
        <span className="agent__engine">
          {(run?.mode ?? agentMode) === "claude" ? "Claude Sonnet 5.5" : "Scripted demo: fixed steps, real rules and PayPal"}
        </span>
      </div>

      <form className="agent__form" onSubmit={start}>
        <div className="agent__presets" role="group" aria-label="Example tasks">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`chip ${task === p.task ? "chip--on" : ""}`}
              onClick={() => setTask(p.task)}
              aria-pressed={task === p.task}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="visually-hidden" htmlFor="task">
          Task for the agent
        </label>
        <textarea id="task" className="agent__task" rows={3} value={task} onChange={(e) => setTask(e.target.value)} maxLength={600} />
        <div className="agent__submit">
          <label className="agent__pick">
            <span>Pay from</span>
            <select value={selected} onChange={(e) => setAllowanceId(e.target.value)}>
              {allowances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.status !== "active" ? ` (${a.status})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={running || sending || !selected || task.trim().length < 3 || runsLeft === 0}>
            {running ? "Agent is working…" : "Send to agent"}
          </button>
        </div>
        {error && (
          <p className="agent__error" role="alert">
            {error}
          </p>
        )}
      </form>

      <div className="feed" aria-live="polite" aria-relevant="additions">
        {!run && <p className="feed__empty">Pick a task and send it. Each step the agent takes shows up here as it happens.</p>}
        {run && (
          <p className="feed__task">
            <span className="feed__task-label">Task</span> {run.task}
          </p>
        )}
        <ol className="feed__list">
          {events.map((e) => (
            <li key={e.seq} className={`feed__item feed__item--${e.kind} tone--${eventTone(e)}`}>
              <time className="feed__time num">{clock(e.at)}</time>
              <span className="feed__mark">{KIND_MARK[e.kind] ?? "Thinking"}</span>
              <p className="feed__text">{e.text}</p>
            </li>
          ))}
        </ol>
        {running && <p className="feed__working">Working</p>}
      </div>
    </section>
  );
}
