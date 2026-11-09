"use client";

import { useRef, useState } from "react";

const CATEGORIES = ["groceries", "books", "health", "electronics"];

export function NewAllowance({ onCreated }: { onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function open() {
    setKey(null);
    setError(null);
    setCopied(false);
    dialog.current?.showModal();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const dollars = (name: string) => Math.round(Number(form.get(name)) * 100);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/allowances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        agentName: String(form.get("agentName")),
        capCents: dollars("cap"),
        period: String(form.get("period")),
        perPurchaseCents: dollars("perPurchase"),
        categories: form.getAll("categories").map(String),
        expiresInDays: form.get("expires") ? Number(form.get("expires")) : null,
      }),
    });
    setBusy(false);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "That allowance couldn't be created.");
      return;
    }
    setKey(body.agentKey);
    onCreated();
  }

  const mcpConfig = key
    ? JSON.stringify(
        {
          mcpServers: {
            allowance: {
              command: "npx",
              args: ["tsx", "/path/to/allowance/mcp/server.mts"],
              env: { ALLOWANCE_URL: typeof window !== "undefined" ? window.location.origin : "", ALLOWANCE_AGENT_KEY: key },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <>
      <button className="btn btn--quiet new-allowance" onClick={open}>
        New allowance
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby="new-title" onClose={() => setKey(null)}>
        {!key ? (
          <form onSubmit={submit} className="dialog__form">
            <h2 id="new-title" className="dialog__title">
              New allowance
            </h2>
            <p className="dialog__lede">Set what an agent can spend without asking you. Anything outside these limits comes to you first.</p>
            <label>
              Name
              <input name="name" required maxLength={60} defaultValue="Office supplies" />
            </label>
            <label>
              Which agent is it for?
              <input name="agentName" required maxLength={40} defaultValue="Claude Desktop" />
            </label>
            <div className="dialog__row">
              <label>
                Spending cap ($)
                <input name="cap" type="number" min="1" max="1000" step="1" required defaultValue="50" inputMode="decimal" />
              </label>
              <label>
                Every
                <select name="period" defaultValue="week">
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
            </div>
            <div className="dialog__row">
              <label>
                Most per purchase ($)
                <input name="perPurchase" type="number" min="1" max="1000" step="1" required defaultValue="25" inputMode="decimal" />
              </label>
              <label>
                Ends after
                <select name="expires" defaultValue="7">
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="">No end date</option>
                </select>
              </label>
            </div>
            <fieldset className="dialog__cats">
              <legend>Can buy without asking</legend>
              {CATEGORIES.map((c) => (
                <label key={c} className="check">
                  <input type="checkbox" name="categories" value={c} defaultChecked={c === "groceries" || c === "books"} />
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </label>
              ))}
            </fieldset>
            {error && (
              <p className="dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog__buttons">
              <button type="button" className="btn btn--quiet" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                Create allowance
              </button>
            </div>
          </form>
        ) : (
          <div className="dialog__form">
            <h2 id="new-title" className="dialog__title">
              Give this key to your agent
            </h2>
            <p className="dialog__lede">
              It&rsquo;s shown once. The agent uses it instead of a card or PayPal login, and you can revoke it any time.
            </p>
            <code className="dialog__key mono">{key}</code>
            <p className="dialog__lede">To connect Claude Desktop or Claude Code, add this to its MCP config, with the path to your copy of the Allowance repo:</p>
            <pre className="dialog__code mono">{mcpConfig}</pre>
            <div className="dialog__buttons">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={async () => {
                  await navigator.clipboard.writeText(key);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy key"}
              </button>
              <button type="button" className="btn" onClick={() => dialog.current?.close()}>
                Done
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
