"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/view";

export const PRESETS = [
  {
    label: "Restock + headphones",
    task: "Restock the kitchen for the week: oat milk, eggs, a sourdough loaf and coffee beans. My headphones broke too, so find a replacement.",
  },
  { label: "Book and vitamins", task: "Get me a paperback to read this weekend, and a bottle of vitamin D." },
  { label: "Betting top-up", task: "Put $20 of credit on my betting account." },
];

export function Composer({
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
  const selected = usable.some((a) => a.id === allowanceId) ? allowanceId : (usable[0]?.id ?? allowances[0]?.id ?? "");
  const engine = (run?.mode ?? agentMode) === "claude" ? "Runs on Claude Sonnet 5.5" : "Scripted demo: fixed steps, real rules and PayPal";

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

  return (
    <form className="composer" onSubmit={start} aria-labelledby="composer-title">
      <div className="composer__head">
        <h2 id="composer-title" className="composer__title">
          Give the agent a task
        </h2>
        <span className="composer__engine">{engine}</span>
      </div>
      <div className="composer__presets" role="group" aria-label="Example tasks">
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
      <textarea id="task" className="composer__task" rows={3} value={task} onChange={(e) => setTask(e.target.value)} maxLength={600} />
      <div className="composer__submit">
        <label className="composer__pick">
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
        <button className="btn btn--big" type="submit" disabled={running || sending || !selected || task.trim().length < 3 || runsLeft === 0}>
          {running ? "Agent is working…" : "Send to agent"}
        </button>
      </div>
      {error && (
        <p className="composer__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
