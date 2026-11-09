"use client";

import { useEffect, useState } from "react";
import type { DashboardState } from "@/lib/view";
import { money, PERIOD_WORD } from "./format";
import { Slip, type PurchaseView } from "./Slip";

type Col = 0 | 1 | 2;

/** Where a purchase rests once its outcome is known: stopped at the rules, or through to PayPal. */
function restingColumn(status: string): Col {
  return status === "completed" || status === "charging" || status === "failed" ? 2 : 1;
}

const VERDICT: Record<string, string> = {
  completed: "Inside every limit",
  charging: "Inside every limit",
  held: "Outside the limits, so it waits for you",
  blocked: "Not allowed at all",
  declined: "You declined it",
  expired: "Nobody answered in time",
  failed: "Allowed, but PayPal didn’t complete it",
};

export function Stage({ state }: { state: DashboardState }) {
  const run = state.run;
  const runPurchases = run ? state.purchases.filter((p) => p.runId === run.id) : [];
  const focus: PurchaseView | undefined = runPurchases[0] ?? state.purchases[0];
  const allowance = state.allowances.find((a) => a.id === (focus?.allowanceId ?? run?.allowanceId)) ?? state.allowances[0];

  // Walk each new purchase from the agent (0), through the rules (1), to where it rests (2).
  const [anim, setAnim] = useState<{ id: string | null; phase: 0 | 1 | 2 }>({ id: focus?.id ?? null, phase: 2 });
  if (focus && anim.id !== focus.id) setAnim({ id: focus.id, phase: 0 });
  useEffect(() => {
    if (anim.phase === 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = reduce
      ? [window.setTimeout(() => setAnim((a) => ({ ...a, phase: 2 })), 0)]
      : [
          window.setTimeout(() => setAnim((a) => (a.phase === 0 ? { ...a, phase: 1 } : a)), 80),
          window.setTimeout(() => setAnim((a) => ({ ...a, phase: 2 })), 900),
        ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [anim.id, anim.phase]);
  const col: Col = !focus ? 0 : anim.phase === 2 ? restingColumn(focus.status) : anim.phase;

  const running = run?.status === "running";
  const lastStep = run?.events.filter((e) => ["thinking", "search", "check", "say", "waiting"].includes(e.kind)).at(-1);
  const agentLine = running
    ? (lastStep?.text ?? "Starting…")
    : run
      ? "Finished. Give it another task above."
      : "Waiting for a task.";
  const lastPaid = state.purchases.find((p) => p.status === "completed");

  return (
    <section className="stage" aria-labelledby="stage-title">
      <h2 id="stage-title" className="visually-hidden">
        How a purchase is decided
      </h2>
      <div className="stage__stations">
        <div className={`station ${col === 0 || running ? "station--live" : ""}`}>
          <p className="station__kicker">The agent asks</p>
          <p className="station__name">{allowance?.agentName ?? "Your agent"}</p>
          <p className={`station__line ${running ? "station__line--live" : ""}`}>{agentLine}</p>
          <p className="station__fine">Holds an Allowance key. Never a card or a PayPal login.</p>
        </div>

        <div className={`station station--rules ${col === 1 && focus ? `station--${focus.status}` : ""}`}>
          <p className="station__kicker">Your rules decide</p>
          <p className="station__name">{allowance?.name ?? "Your allowance"}</p>
          {allowance && (
            <ul className="station__rules">
              <li className="num">
                {money(allowance.capCents)} {PERIOD_WORD[allowance.period]}
              </li>
              <li className="num">up to {money(allowance.perPurchaseCents)} each</li>
              <li>{allowance.categories.join(", ")}</li>
            </ul>
          )}
          <p className="station__fine">
            {!focus
              ? "Every purchase is checked here first."
              : focus.approvedByOwner
                ? "Outside the limits, so it went to you. You approved it."
                : VERDICT[focus.status]}
          </p>
        </div>

        <div className={`station station--paypal ${col === 2 && focus ? "station--live" : ""}`}>
          <p className="station__kicker">PayPal pays</p>
          <p className="station__name">{state.paypalMode === "sandbox" ? "PayPal sandbox" : "Simulated PayPal"}</p>
          <p className="station__line">
            {state.paypalAccount?.email ?? (state.paypalAccount?.shared ? "Shared demo account" : "Not connected yet")}
          </p>
          <p className="station__fine">
            {lastPaid ? (
              <>
                Last order <span className="mono">{lastPaid.paypalOrderId}</span>
              </>
            ) : (
              "Saved once with PayPal Vault, charged per purchase."
            )}
          </p>
        </div>

      </div>

      <div className="stage__track" aria-live="polite">
        <div className="stage__rail" aria-hidden="true" />
        {focus ? (
          <div className="stage__slip" style={{ transform: `translateX(${col * 100}%)` }} data-col={col}>
            <Slip p={focus} compact />
          </div>
        ) : (
          <p className="stage__empty">Purchases travel along here as the agent makes them.</p>
        )}
      </div>
    </section>
  );
}
