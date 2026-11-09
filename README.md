# Allowance

**Give your AI agent an allowance, not your card.**

Allowance lets a person hand an AI agent a spending allowance backed by their PayPal account: a cap per day, week or month, a limit per purchase, and the categories it can buy in without asking. Inside those limits the agent pays straight away through PayPal. Anything outside them is held, and the owner approves or declines it from their phone with a press-and-hold. The agent waits for the answer and carries on.

The agent never sees a card number or a PayPal login. It holds a scoped Allowance key that the owner can pause or revoke at any time.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Nov 2026).

## The problem

Agents can already shop, but the only way to let one pay is to give it your card or your account. That's all-or-nothing: no limits, no way to see what it's doing, no way to stop it except cancelling the card. People won't hand over that much trust, so agentic commerce stalls at "here's a link, you check out". Allowance is the missing middle: you let an agent spend some of your money, on your terms, through the PayPal you already use. See [COMPETITORS.md](COMPETITORS.md) for how this differs from what exists.

## Two-minute demo

1. Open the app. You land on your own demo workspace, with one allowance already set up: **$60 a week, up to $30 a purchase, groceries and books only**.
2. Pick **Restock + headphones** and press **Send to agent**. Claude checks the allowance, searches the shops and buys the groceries. They're inside the limits, so PayPal is charged at once and the order id appears in the feed and the ledger.
3. Next it tries **$89 headphones**: electronics, and over the per-purchase limit. The purchase is **held**. A "Waiting for you" panel appears with the plain-English reasons and a QR code.
4. Scan the QR code with your phone (or open the request link). **Press and hold** to approve. A short tap does nothing, on purpose. PayPal is charged, and the agent, which was waiting, reports back.
5. Try **Betting top-up**: the shop is blocked outright. No approval is offered and nothing is charged.
6. Press **Revoke** on the allowance. Its key stops working at once, and anything still waiting for you is cancelled.

## How it uses PayPal

| PayPal capability | Where |
| --- | --- |
| **Vault v3: setup tokens and payment tokens** (`/v3/vault/setup-tokens`, `/v3/vault/payment-tokens`) | The owner saves their PayPal once (**Connect your PayPal**). That consent is what lets agents pay later without the owner at checkout. `src/lib/paypal.ts` |
| **Orders v2 with `payment_source.paypal.vault_id`** (`/v2/checkout/orders`, `intent: CAPTURE`) | Each allowed or approved purchase is one order, captured in the same call, with line items and an item-total breakdown. `src/lib/paypal.ts` |
| **Idempotency** (`PayPal-Request-Id`) | The Allowance purchase id is the request id, so a retried or double-tapped approval can never charge twice. |
| **OAuth 2.0 client credentials** | Token cached until shortly before it expires. |
| **`paypal-debug-id`** | Stored on failed purchases and shown in the ledger, so a failure can be traced in PayPal's dashboard. |

Without PayPal keys the app runs against a clearly labelled **Simulated PayPal**, so it still works offline.

## How it uses AI

- **Claude Sonnet 5.5** (Anthropic Messages API, `@anthropic-ai/sdk`) is the shopping agent, in `src/lib/agent.ts`. It has three strict tools, `check_allowance`, `search_shops` and `buy`, and no other way to act. Adaptive thinking is on, with summaries shown live in the feed, and Anthropic's server-side refusal fallback (`fallbacks: "default"`) is enabled.
- The system prompt tells the agent not to split or retry held purchases. The rules engine enforces that independently, so the guard doesn't depend on the model behaving.
- **An MCP server** (`mcp/server.mts`) gives any MCP agent, such as Claude Desktop or Claude Code, an allowance with one config block.
- Without an Anthropic key, the agent runs a labelled **scripted** version of the demo task. The rules and PayPal calls in that mode are real.

## Architecture

```
 agent (Claude in-app, or any MCP / HTTP agent)
   │  Allowance key (scoped, revocable; no payment details)
   ▼
 Allowance API ──► rules engine (src/lib/policy.ts) ──► allow ──► PayPal Orders v2 (vault_id) ──► ledger
                                                    ├─► hold  ──► owner's phone: press-and-hold ──► PayPal
                                                    └─► block ──► nothing charged
```

- **Rules engine** (`src/lib/policy.ts`): a pure function. It returns allow, hold or block, with reasons written for the owner, and covers caps per period, per-purchase limits, categories, shop allow and block lists, expiry, pause and revoke, plus an **anti-splitting rule**: after a purchase is held or declined, smaller follow-ups at the same shop are held for 15 minutes.
- **Prices come from the shop catalog on the server.** The agent names items and quantities, never amounts.
- The cap check and the purchase record happen in **one transaction**, so two purchases can't both squeeze under the cap. Approvals are **single-use**: only the first answer counts.
- **Approval links** are 192-bit random tokens that expire after 30 minutes. They let the owner answer from a phone without signing in.
- **Each visitor gets their own workspace** (cookie-scoped), so judges testing at the same time don't see each other's data. The hosted demo has a per-workspace limit on agent runs.
- **Stack:** Next.js 16 (App Router), SQLite (`node:sqlite`), AG Grid for the ledger, Zod for request validation.

## Run it locally

Needs Node 24+.

```bash
npm install
cp .env.example .env.local     # add keys (all optional, see below)
npm run build && npm start     # http://localhost:3000
```

| Variable | What it does | Without it |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal **sandbox** app keys (developer.paypal.com → Apps & Credentials → Sandbox). In the app's settings, enable **Vault** under Accept payments. | Simulated PayPal |
| `DEMO_VAULT_ID` | A saved sandbox PayPal (vault id) that demo workspaces pay with until a visitor connects their own. | Each visitor must press **Connect your PayPal** first |
| `ANTHROPIC_API_KEY` | Runs the agent on Claude. | Scripted agent |
| `APP_URL` | Public URL, used for PayPal return links. | Taken from the request |

Tests: `npm test` runs the rules engine and the purchase flow (`src/lib/*.test.ts`). `node scripts/verify.mjs` drives the whole demo in a real browser: real clicks, a real press-and-hold on a phone-sized screen, and mouse-wheel scrolling in Chromium and WebKit.

### Connect Claude Desktop or Claude Code (MCP)

Create an allowance in the app with **New allowance**, then copy the key it shows once. Add this to your MCP config:

```json
{
  "mcpServers": {
    "allowance": {
      "command": "npx",
      "args": ["tsx", "/path/to/allowance/mcp/server.mts"],
      "env": { "ALLOWANCE_URL": "http://localhost:3000", "ALLOWANCE_AGENT_KEY": "alw_key_..." }
    }
  }
}
```

### Agent HTTP API

All requests take `Authorization: Bearer alw_key_...`.

- `GET /api/agent/allowance`: limits, spent and remaining.
- `GET /api/agent/shops?q=oat milk`: search items.
- `POST /api/agent/purchases` with `{ "shopId", "items": [{ "sku", "qty" }], "reason" }`. Returns `completed`, `blocked`, or `held` (202).
- `GET /api/agent/purchases/:id`: poll a held purchase until the owner answers.

## Licence

MIT. See [LICENSE](LICENSE).
