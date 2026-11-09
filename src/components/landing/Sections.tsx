"use client";

import Link from "next/link";
import CountUp from "../reactbits/CountUp";
import ScrollReveal from "../reactbits/ScrollReveal";
import SpotlightCard from "../reactbits/SpotlightCard";

export function Nav() {
  return (
    <header className="nav">
      <div className="nav__inner">
        <Link href="/" className="nav__brand" aria-label="Allowance, home">
          <span className="nav__mark" aria-hidden="true" />
          Allowance
        </Link>
        <nav className="nav__links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#developers">Developers</a>
          <a href="https://github.com/MarcussRico/allowance">GitHub</a>
        </nav>
        <Link className="btn btn--small" href="/app">
          Live demo <span className="btn__arrow">→</span>
        </Link>
      </div>
    </header>
  );
}

export function Problem() {
  return (
    <section className="problem" aria-label="The problem">
      <ScrollReveal
        containerClassName="problem__text"
        baseOpacity={0.12}
        enableBlur
        blurStrength={6}
        baseRotation={0}
        wordAnimationEnd="bottom 60%"
      >
        Agents can already shop. But the only way to let one pay is to hand over your card or your login. No limits, no view of what it&apos;s doing, and no way to stop it short of cancelling the card.
      </ScrollReveal>
    </section>
  );
}

const SAFETY = [
  {
    title: "No card, no login",
    body: "The agent holds a scoped Allowance key. Your PayPal details stay on the server and never reach the agent.",
  },
  {
    title: "Prices come from the shop",
    body: "Agents name items, never amounts. One can't claim an $89 pair of headphones costs $9.",
  },
  {
    title: "Splitting doesn't work",
    body: "After a purchase is held or declined, smaller ones at the same shop wait too, for 15 minutes.",
  },
  {
    title: "Approvals can't be replayed",
    body: "Each approval link is 192-bit random, expires in 30 minutes, and only its first answer counts.",
  },
  {
    title: "Charged once, always",
    body: "Every PayPal order carries the purchase id as its idempotency key. A double-tap can't charge twice.",
  },
  {
    title: "Everything on the ledger",
    body: "Every attempt, whether paid, held or blocked, is recorded with its reasons and its PayPal order id.",
  },
];

const CARD_STYLE = {
  "--spotlight-card-surface": "#0f1a2e",
  "--spotlight-card-border": "rgba(237, 230, 211, 0.1)",
} as React.CSSProperties;

export function Safety() {
  return (
    <section id="safety" className="safety" aria-labelledby="safety-title">
      <p className="section-kicker">Safety</p>
      <h2 id="safety-title" className="section-heading">
        Built so an agent can&rsquo;t talk its way past your limits.
      </h2>
      <p className="section-lede">The rules are enforced in code on the server, not in the agent&rsquo;s prompt. A model that misbehaves still can&rsquo;t spend more than you allowed.</p>
      <div className="safety__grid">
        {SAFETY.map((s) => (
          <SpotlightCard
            key={s.title}
            className="safety__card"
            spotlightColor="rgba(201, 165, 94, 0.22)"
            spotlightSize={280}
            borderGlow={0.5}
            theme="dark"
            style={CARD_STYLE}
          >
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </SpotlightCard>
        ))}
      </div>
    </section>
  );
}

const NUMBERS = [
  { to: 192, suffix: "-bit", label: "random approval links, single-use" },
  { to: 30, suffix: " min", label: "before an unanswered request expires" },
  { to: 15, suffix: " min", label: "anti-splitting window after a hold" },
  { to: 0, suffix: "", label: "cards or PayPal logins shared with an agent" },
];

export function Numbers() {
  return (
    <section className="numbers" aria-label="By the numbers">
      {NUMBERS.map((n) => (
        <div key={n.label} className="numbers__item">
          <p className="numbers__value num">
            <CountUp to={n.to} duration={1.6} />
            <span>{n.suffix}</span>
          </p>
          <p className="numbers__label">{n.label}</p>
        </div>
      ))}
    </section>
  );
}

const MCP = `{
  "mcpServers": {
    "allowance": {
      "command": "npx",
      "args": ["tsx", "allowance/mcp/server.mts"],
      "env": {
        "ALLOWANCE_URL": "https://allowance-23yv.onrender.com",
        "ALLOWANCE_AGENT_KEY": "alw_key_…"
      }
    }
  }
}`;

export function Developers() {
  return (
    <section id="developers" className="devs" aria-labelledby="devs-title">
      <div className="devs__copy">
        <p className="section-kicker">For developers</p>
        <h2 id="devs-title" className="section-heading">
          Any agent can have an allowance.
        </h2>
        <p className="section-lede">
          Claude Desktop, Claude Code or any MCP agent gets three tools: <code>check_allowance</code>, <code>search_shops</code> and <code>buy</code>. Agents built
          on anything else use the same rules over plain HTTP.
        </p>
        <ul className="devs__endpoints">
          <li>
            <code>GET /api/agent/allowance</code> <span>limits, spent and remaining</span>
          </li>
          <li>
            <code>POST /api/agent/purchases</code> <span>paid, blocked, or held for the owner</span>
          </li>
          <li>
            <code>GET /api/agent/purchases/:id</code> <span>wait for the owner&rsquo;s answer</span>
          </li>
        </ul>
      </div>
      <figure className="devs__code">
        <figcaption>claude_desktop_config.json</figcaption>
        <pre className="mono">{MCP}</pre>
      </figure>
    </section>
  );
}

const PAYPAL = [
  { api: "Vault v3", what: "Save once", body: "The owner approves saving their PayPal a single time. That consent is what agents spend against." },
  { api: "Orders v2 + vault_id", what: "Pay per purchase", body: "Each allowed or approved purchase is one order with line items, captured in the same call." },
  { api: "PayPal-Request-Id", what: "Never twice", body: "The purchase id doubles as the idempotency key, so a retry or double-tap can't charge again." },
];

export function OnPayPal() {
  return (
    <section className="onpaypal" aria-labelledby="onpaypal-title">
      <p className="section-kicker">How it uses PayPal</p>
      <h2 id="onpaypal-title" className="section-heading">
        The account people already trust, with an agent-sized door.
      </h2>
      <div className="onpaypal__rows">
        {PAYPAL.map((p) => (
          <div key={p.api} className="onpaypal__row">
            <p className="onpaypal__what">{p.what}</p>
            <p className="onpaypal__api mono">{p.api}</p>
            <p className="onpaypal__body">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-title">
      <h2 id="final-title" className="final__title">
        Try it with a <span className="final__serif">$60</span> allowance.
      </h2>
      <p className="final__lede">Send the agent a task, watch it shop, and approve the one purchase that needs you from your phone.</p>
      <Link className="btn btn--big" href="/app">
        Open the live demo <span className="btn__arrow">→</span>
      </Link>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <p>
        Allowance · built for the PayPal AI Hackathon 2026 · <a href="https://github.com/MarcussRico/allowance">Source on GitHub</a> · MIT licence
      </p>
      <p>Runs on PayPal&rsquo;s sandbox and Claude. No real money moves in the demo.</p>
    </footer>
  );
}
