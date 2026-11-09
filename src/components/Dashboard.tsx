"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState } from "@/lib/view";
import { AgentPanel } from "./AgentPanel";
import { AllowanceCard } from "./AllowanceCard";
import { HeldRequests } from "./HeldRequests";
import { Ledger } from "./Ledger";
import { NewAllowance } from "./NewAllowance";
import "./dashboard.css";

const PAYPAL_NOTICE: Record<string, string> = {
  connected: "Your sandbox PayPal is connected. Agents pay with it from now on.",
  cancelled: "PayPal wasn't connected. Nothing changed.",
  mismatch: "That PayPal approval didn't match this workspace. Try connecting again.",
};

export function Dashboard({ initial, notice }: { initial: DashboardState; notice: string | null }) {
  const [state, setState] = useState(initial);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } finally {
      inFlight.current = false;
    }
  }, []);

  const held = useMemo(() => state.purchases.filter((p) => p.status === "held"), [state.purchases]);
  const busy = state.run?.status === "running" || held.length > 0;

  // Fast updates while the agent works or something waits for you; slow otherwise. Paused in background tabs.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, busy ? 900 : 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [busy, refresh]);

  const agentNames = useMemo(() => Object.fromEntries(state.allowances.map((a) => [a.id, a.agentName])), [state.allowances]);

  async function connectPayPal() {
    setConnecting(true);
    setConnectError(null);
    const res = await fetch("/api/paypal/connect", { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setConnecting(false);
      setConnectError(body.error ?? "Couldn't reach PayPal.");
      return;
    }
    window.location.href = body.approveUrl;
  }

  async function freshWorkspace() {
    const res = await fetch("/api/workspace/reset", { method: "POST" });
    if (!res.ok) {
      setConnectError((await res.json()).error ?? "Couldn't start over.");
      return;
    }
    setConnectError(null);
    await refresh();
  }

  const noticeText = notice ? PAYPAL_NOTICE[notice] ?? `PayPal said: ${notice}. Nothing was connected.` : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Allowance</span>
          <span className="brand__line">Spending limits for AI agents, paid with PayPal</span>
        </div>
        <div className="topbar__right">
          <span className={`paypal-state paypal-state--${state.paypalMode}`}>
            {state.paypalMode === "sandbox" ? "PayPal sandbox" : "Simulated PayPal"}
            {state.paypalAccount?.email ? ` · ${state.paypalAccount.email}` : state.paypalAccount?.shared ? " · demo account" : ""}
          </span>
          {state.paypalMode === "sandbox" && (
            <button className="btn btn--quiet btn--small" onClick={connectPayPal} disabled={connecting}>
              {state.paypalAccount && !state.paypalAccount.shared ? "Reconnect PayPal" : "Connect your PayPal"}
            </button>
          )}
          <button className="btn btn--quiet btn--small" onClick={freshWorkspace}>
            Start over
          </button>
        </div>
      </header>

      {(noticeText || connectError) && (
        <p className="notice" role="status">
          {connectError ?? noticeText}
        </p>
      )}
      {!state.paypalAccount && (
        <p className="notice notice--hold" role="status">
          Connect a sandbox PayPal account before the agent can pay for anything.
        </p>
      )}

      <main className="board">
        <HeldRequests held={held} agentNames={agentNames} onChanged={refresh} />

        <section className="allowances" aria-labelledby="allowances-title">
          <div className="allowances__head">
            <h2 id="allowances-title" className="section-title">
              Your allowances
            </h2>
            <NewAllowance onCreated={refresh} />
          </div>
          <div className="allowances__list">
            {state.allowances.map((a) => (
              <AllowanceCard key={a.id} allowance={a} onChanged={refresh} />
            ))}
          </div>
        </section>

        <AgentPanel
          run={state.run}
          allowances={state.allowances}
          agentMode={state.agentMode}
          runsLeft={state.runsLeft}
          onStarted={refresh}
        />

        <Ledger purchases={state.purchases} agentNames={agentNames} />
      </main>

      <footer className="colophon">
        <p>
          The agent never sees a card or a PayPal login. It holds an Allowance key; every purchase is checked against your limits, and
          only then paid through PayPal with the account you saved once.
        </p>
      </footer>
    </div>
  );
}
