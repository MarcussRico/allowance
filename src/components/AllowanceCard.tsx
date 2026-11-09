"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/view";
import { GuillocheBand, GuillocheRosette } from "./Guilloche";
import { money, PERIOD_WORD, shortDate } from "./format";

type AllowanceView = DashboardState["allowances"][number];

const STATUS_COPY = { active: "Active", paused: "Paused", revoked: "Revoked" } as const;

export function AllowanceCard({
  allowance: a,
  onChanged,
}: {
  allowance: AllowanceView;
  onChanged: () => void;
}) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spentFraction = a.capCents > 0 ? a.spentThisPeriodCents / a.capCents : 0;
  const expired = a.expired;

  async function setStatus(status: "active" | "paused" | "revoked") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/allowances/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    setConfirmingRevoke(false);
    if (!res.ok) setError((await res.json()).error ?? "That didn't save.");
    onChanged();
  }

  return (
    <article className={`cheque cheque--${a.status}`} aria-labelledby={`${a.id}-name`}>
      <GuillocheRosette seed={a.id} />
      <header className="cheque__head">
        <p className="cheque__agent">
          For <strong>{a.agentName}</strong>
          <span className={`cheque__status cheque__status--${expired ? "expired" : a.status}`}>
            {expired ? "Expired" : STATUS_COPY[a.status]}
          </span>
        </p>
        <h3 id={`${a.id}-name`} className="cheque__name">
          {a.name}
        </h3>
      </header>

      <p className="cheque__amount">
        <span className="cheque__left num">{money(a.remainingCents)}</span>
        <span className="cheque__of">
          left of <span className="num">{money(a.capCents)}</span> {PERIOD_WORD[a.period]}
          {a.spentThisPeriodCents > a.capCents && (
            <span className="cheque__over">
              {" "}
              · <span className="num">{money(a.spentThisPeriodCents - a.capCents)}</span> over, with your approval
            </span>
          )}
        </span>
      </p>

      <GuillocheBand
        seed={a.id}
        spentFraction={spentFraction}
        label={`${money(a.spentThisPeriodCents)} of ${money(a.capCents)} spent ${PERIOD_WORD[a.period]}`}
      />

      <dl className="cheque__rules">
        <div>
          <dt>Each purchase</dt>
          <dd className="num">up to {money(a.perPurchaseCents)}</dd>
        </div>
        <div>
          <dt>Without asking</dt>
          <dd>{a.categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{a.expiresAt ? shortDate(a.expiresAt) : "No end date"}</dd>
        </div>
      </dl>

      <footer className="cheque__foot">
        <span className="cheque__key mono" title="The agent's key. Only its last four characters are kept in view.">
          Agent key ···{a.agentKeyHint}
        </span>
        {a.status !== "revoked" && (
          <span className="cheque__actions">
            {a.status === "active" ? (
              <button className="btn btn--quiet btn--small" disabled={busy} onClick={() => setStatus("paused")}>
                Pause
              </button>
            ) : (
              <button className="btn btn--quiet btn--small" disabled={busy} onClick={() => setStatus("active")}>
                Resume
              </button>
            )}
            {confirmingRevoke ? (
              <>
                <button className="btn btn--danger btn--small" disabled={busy} onClick={() => setStatus("revoked")}>
                  Revoke for good
                </button>
                <button className="btn btn--quiet btn--small" disabled={busy} onClick={() => setConfirmingRevoke(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button className="btn btn--danger btn--small" disabled={busy} onClick={() => setConfirmingRevoke(true)}>
                Revoke
              </button>
            )}
          </span>
        )}
      </footer>
      {error && (
        <p className="cheque__error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
