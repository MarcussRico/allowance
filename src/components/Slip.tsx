import type { DashboardState } from "@/lib/view";
import { money } from "./format";

export type PurchaseView = DashboardState["purchases"][number];

const STAMP: Record<string, { text: string; tone: string }> = {
  completed: { text: "Paid", tone: "paid" },
  charging: { text: "Paying", tone: "pending" },
  held: { text: "Waiting for you", tone: "hold" },
  blocked: { text: "Blocked", tone: "block" },
  declined: { text: "Declined", tone: "block" },
  failed: { text: "Didn’t go through", tone: "block" },
  expired: { text: "Expired", tone: "block" },
};

export function Stamp({ status, approved }: { status: string; approved?: boolean }) {
  const s = STAMP[status] ?? { text: status, tone: "pending" };
  return (
    // Keyed on status so a change of outcome re-runs the landing animation.
    <span key={status} className={`stamp stamp--${s.tone}`}>
      <span className="stamp__text">{s.text}</span>
      {approved && status === "completed" && <span className="stamp__sub">you approved</span>}
    </span>
  );
}

/** A purchase as a paper slip: what was bought, where, for how much, and the stamp it got. */
export function Slip({ p, compact = false }: { p: PurchaseView; compact?: boolean }) {
  const shown = compact ? p.lines.slice(0, 2) : p.lines;
  const more = p.lines.length - shown.length;
  return (
    <article className={`slip slip--${p.status} ${compact ? "slip--compact" : ""}`} aria-label={`${p.merchantName}, ${money(p.amountCents)}`}>
      <header className="slip__head">
        <span className="slip__shop">{p.merchantName}</span>
        <span className="slip__amount num">{money(p.amountCents)}</span>
      </header>
      <ul className="slip__lines">
        {shown.map((l) => (
          <li key={l.sku}>
            <span>
              {l.qty} × {l.name}
            </span>
            {!compact && <span className="num">{money(l.lineCents)}</span>}
          </li>
        ))}
        {more > 0 && <li className="slip__more">and {more} more</li>}
      </ul>
      <footer className="slip__foot">
        <Stamp status={p.status} approved={p.approvedByOwner} />
        {p.paypalOrderId && !compact && <span className="slip__order mono">PayPal {p.paypalOrderId}</span>}
      </footer>
      {!compact && p.reasons.length > 0 && p.status !== "completed" && (
        <ul className="slip__reasons">
          {p.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {!compact && p.status === "failed" && p.error && <p className="slip__error">{p.error}</p>}
    </article>
  );
}
