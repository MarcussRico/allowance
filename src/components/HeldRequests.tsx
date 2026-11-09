"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { DashboardState } from "@/lib/view";
import { money } from "./format";

type PurchaseView = DashboardState["purchases"][number];

function PhoneCode({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}${path}`, {
      margin: 0,
      width: 220,
      color: { dark: "#15211b", light: "#00000000" },
    }).then(setSrc);
  }, [path]);
  return (
    <figure className="held__qr">
      {src ? <img src={src} alt="QR code that opens this request on your phone" width={110} height={110} /> : <span className="held__qr-ph" />}
      <figcaption>Answer on your phone</figcaption>
    </figure>
  );
}

export function HeldRequests({ held, agentNames, onChanged }: { held: PurchaseView[]; agentNames: Record<string, string>; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (held.length === 0) return null;

  async function answer(p: PurchaseView, choice: "approve" | "decline") {
    if (!p.approvalPath) return;
    setBusy(p.id);
    setError(null);
    const token = p.approvalPath.split("/").pop();
    const res = await fetch(`/api/approvals/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: choice }),
    });
    setBusy(null);
    if (!res.ok) setError((await res.json()).error ?? "That answer didn't go through.");
    onChanged();
  }

  return (
    <section className="held" aria-labelledby="held-title">
      <h2 id="held-title" className="held__title">
        Waiting for you
      </h2>
      {held.map((p) => (
        <article key={p.id} className="held__item">
          <div className="held__body">
            <p className="held__ask">
              <strong>{agentNames[p.allowanceId] ?? "Your agent"}</strong> wants to spend{" "}
              <span className="held__amount num">{money(p.amountCents)}</span> at {p.merchantName}
            </p>
            <p className="held__lines">{p.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</p>
            {p.agentNote && <p className="held__note">“{p.agentNote}”</p>}
            <ul className="held__reasons">
              {p.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="held__buttons">
              <button className="btn" disabled={busy === p.id} onClick={() => answer(p, "approve")}>
                Approve {money(p.amountCents)}
              </button>
              <button className="btn btn--quiet" disabled={busy === p.id} onClick={() => answer(p, "decline")}>
                Decline
              </button>
            </div>
            {error && (
              <p className="held__error" role="alert">
                {error}
              </p>
            )}
          </div>
          {p.approvalPath && <PhoneCode path={p.approvalPath} />}
        </article>
      ))}
    </section>
  );
}
