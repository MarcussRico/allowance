"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/view";
import { GuillocheBand, GuillocheFrame, GuillocheRosette } from "./Guilloche";
import { money, PERIOD_WORD, shortDate } from "./format";
import { LocalTime } from "./LocalTime";

type AllowanceView = DashboardState["allowances"][number];

const STATUS_COPY = { active: "Active", paused: "Paused", revoked: "Revoked" } as const;

export function AllowanceCard({ allowance: a, onChanged }: { allowance: AllowanceView; onChanged: () => void }) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spentFraction = a.capCents > 0 ? a.spentThisPeriodCents / a.capCents : 0;
  const status = a.expired && a.status === "active" ? "expired" : a.status;
  const over = a.spentThisPeriodCents - a.capCents;

  async function setStatus(next: "active" | "paused" | "revoked") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/allowances/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    setConfirmingRevoke(false);
    if (!res.ok) setError((await res.json()).error ?? "That didn't save.");
    onChanged();
  }

  return (
    <article className={`note note--${status}`} aria-labelledby={`${a.id}-name`}>
      <GuillocheFrame seed={a.id} />
      <div className="note__watermark">
        <GuillocheRosette seed={a.id} size={150} />
      </div>
      {status === "revoked" && (
        <span className="note__void" aria-hidden="true">
          Void
        </span>
      )}

      <div className="note__inner">
        <header className="note__head">
          <p className="note__for">
            Allowance for <strong>{a.agentName}</strong>
          </p>
          <span className={`note__status note__status--${status}`}>{status === "expired" ? "Expired" : STATUS_COPY[a.status]}</span>
        </header>
        <h3 id={`${a.id}-name`} className="note__name">
          {a.name}
        </h3>

        <p className="note__denomination">
          <span className="note__left num">{money(a.remainingCents)}</span>
          <span className="note__of">
            left of <span className="num">{money(a.capCents)}</span> {PERIOD_WORD[a.period]}
          </span>
          {over > 0 && (
            <span className="note__over">
              <span className="num">{money(over)}</span> over, with your approval
            </span>
          )}
        </p>

        <GuillocheBand
          seed={a.id}
          spentFraction={spentFraction}
          height={30}
          label={`${money(a.spentThisPeriodCents)} of ${money(a.capCents)} spent ${PERIOD_WORD[a.period]}`}
        />
        <p className="note__spent num">
          {money(a.spentThisPeriodCents)} spent {PERIOD_WORD[a.period]}
        </p>

        <dl className="note__rules">
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
            <dd>{a.expiresAt ? <LocalTime iso={a.expiresAt} format={shortDate} /> : "No end date"}</dd>
          </div>
        </dl>

        <footer className="note__foot">
          <p className="note__serial">
            <span>Key</span> <span className="mono">···{a.agentKeyHint}</span>
          </p>
          <p className="note__signature">
            <span className="note__signed">You</span>
            <span className="note__sig-label">Authorised by</span>
          </p>
        </footer>

        {a.status !== "revoked" && (
          <div className="note__actions">
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
          </div>
        )}
        {error && (
          <p className="note__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
