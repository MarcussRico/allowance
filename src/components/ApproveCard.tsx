"use client";

import { useEffect, useRef, useState } from "react";
import type { Purchase } from "@/lib/store";
import { money } from "./format";
import "./approve.css";

const HOLD_MS = 1200;

type View = Omit<Purchase, "approvalToken">;

export function ApproveCard({
  token,
  purchase: initial,
  allowance,
}: {
  token: string;
  purchase: View;
  allowance: { name: string; agentName: string; status: string };
}) {
  const [purchase, setPurchase] = useState(initial);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  async function answer(choice: "approve" | "decline") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/approvals/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: choice }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) setError(body.error ?? "That answer didn't go through.");
    else setPurchase(body.purchase);
  }

  function startHold() {
    if (busy || purchase.status !== "held") return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      void answer("approve");
    }, HOLD_MS);
  }
  function endHold() {
    setHolding(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => () => endHold(), []);

  const open = purchase.status === "held" && allowance.status !== "revoked";

  return (
    <main className="approve">
      <section className="approve__card" aria-labelledby="approve-title">
        <p className="approve__eyebrow">{allowance.name}</p>
        <h1 id="approve-title" className="approve__title">
          {allowance.agentName} wants to spend
        </h1>
        <p className="approve__amount num">{money(purchase.amountCents)}</p>
        <p className="approve__shop">at {purchase.merchantName}</p>

        <ul className="approve__lines">
          {purchase.lines.map((l) => (
            <li key={l.sku}>
              <span>
                {l.qty} × {l.name}
              </span>
              <span className="num">{money(l.lineCents)}</span>
            </li>
          ))}
        </ul>
        {purchase.agentNote && <p className="approve__note">“{purchase.agentNote}”</p>}

        <h2 className="approve__why">Why it needs you</h2>
        <ul className="approve__reasons">
          {purchase.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        {open ? (
          <div className="approve__actions">
            <button
              className={`hold ${holding ? "hold--on" : ""}`}
              disabled={busy}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") endHold();
              }}
              onContextMenu={(e) => e.preventDefault()}
              aria-describedby="hold-help"
            >
              <span className="hold__fill" aria-hidden="true" />
              <span className="hold__label">{busy ? "Paying…" : `Hold to approve ${money(purchase.amountCents)}`}</span>
            </button>
            <p id="hold-help" className="approve__help">
              Press and hold for a second. Letting go early cancels.
            </p>
            <button className="btn btn--quiet approve__decline" disabled={busy} onClick={() => answer("decline")}>
              Decline
            </button>
          </div>
        ) : (
          <p className={`approve__result approve__result--${purchase.status}`} role="status">
            {purchase.status === "completed" && `Approved and paid through PayPal. Order ${purchase.paypalOrderId}.`}
            {purchase.status === "declined" && "Declined. Nothing was charged, and the agent has been told."}
            {purchase.status === "expired" && "This request expired without an answer. Nothing was charged."}
            {purchase.status === "failed" && `PayPal didn't complete it: ${purchase.error}`}
            {purchase.status === "charging" && "Paying through PayPal…"}
            {purchase.status === "held" && allowance.status === "revoked" && "This allowance was revoked, so it can't be approved."}
          </p>
        )}
        {error && (
          <p className="approve__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
