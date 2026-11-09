# How Allowance compares

*Researched 9 Nov 2026. Vendor claims come from public write-ups and comparisons and weren't independently verified. Check each vendor's own docs before quoting any figure.*

## The gap

Agents can already pay. What's missing is the owner's side: a way for a person to let an agent spend **some** of their money, see every purchase, approve the exceptions from their phone, and switch it off, without handing over a card or a login. Most offerings here are built for platforms and developers, not for the person whose money it is, and few of them run on PayPal.

## Existing approaches

| Approach | What it does well | Where it falls short for this job |
| --- | --- | --- |
| **Card-network agent programs** (Mastercard Agent Pay, Visa Intelligent Commerce) | Agent-specific tokens and agent identification at the network level. | Aimed at issuers and large merchants, with no self-serve path for an individual. Published comparisons disagree on whether per-agent limits are enforced, and none describe a consumer approval flow. |
| **Stripe** (Link for agents, Issuing) | Issuing has strong card-level controls: per-transaction limits, merchant allowlists, velocity caps. | Issuing is a business product for issuing cards. Reports describe Link's agent spending as granting wallet access with limits, with fully approval-free spend inside limits still rolling out. Nothing handles per-purchase escalation to the owner. |
| **Agent payment startups** (Payman, Skyfire, Nekuda) | Purpose-built for agents: dashboard policies, approval thresholds (Payman), cryptographic agent identity (Skyfire). | Each runs its own rails or wallets (some crypto-first), so the person has to fund a new account rather than use the PayPal they already have. |
| **Protocols** (Google AP2 mandates, x402) | Standard ways to express intent and authorise agent payments. | Protocols, not products. One analysis notes AP2 and x402 mostly don't block an overspend themselves; enforcement is left to the implementer. |

## What Allowance does differently

1. **It's built on the PayPal account people already have.** The owner saves their PayPal once through Vault. That one consent is what agents spend against, so there's no new wallet to fund.
2. **Out-of-policy purchases come to the owner, they don't just fail.** A held purchase appears on the dashboard and as a phone link with a 1.2-second press-and-hold to approve. The agent waits for the answer and carries on.
3. **The agent never holds a payment credential.** It holds a scoped, revocable Allowance key. Prices come from the shop, not the agent, so an agent can't under-report an amount.
4. **It can't be gamed by splitting.** After a purchase is held or declined, smaller follow-ups at the same shop are held too for 15 minutes. Most limit systems check each purchase on its own.
5. **Any agent can use it.** It ships as an HTTP API and an MCP server, so Claude Desktop, Claude Code or any MCP agent gets an allowance with one config block.

## The one-line pitch

Give your AI agent an allowance, not your card: it shops within your limits through PayPal, and anything outside them waits for a tap on your phone.

## Sources

- [AI Agent Spend Governance Tools Compared (2026)](https://pinkwallet.com/agentic/learn/ai-agent-spend-governance-tools-compared/)
- [The 7 Best AI Agent Payment Infrastructure Providers](https://fintechspecs.com/blog/best-ai-agent-payment-infrastructure-providers/)
- [Agentic Payments: Visa vs Stripe vs Mastercard](https://www.deeplumen.com/blog/agentic-payment-infrastructure/)
- [Visa, Mastercard, and Google Now Let AI Agents Pay](https://www.refontelearning.com/blog/agentic-commerce-ai-agent-payment-protocols)
- [Best Platforms for Agentic Payments in 2026](https://nevermined.ai/blog/best-platforms-agentic-payments)
- [AI Agent Spending Limits 2026: What Actually Works](https://startupik.com/ai-agent-spending-limits-2026/)
- [PayPal Agentic Commerce Services launch](https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping)
