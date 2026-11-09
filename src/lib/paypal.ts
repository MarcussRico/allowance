import crypto from "node:crypto";

/**
 * PayPal, as Allowance uses it:
 *  1. The owner saves their PayPal once (Vault v3 setup token -> payment token).
 *     That one consent is what lets an agent pay later without the owner present.
 *  2. Each allowed purchase is an Orders v2 order paid with the saved vault_id,
 *     captured in the same call.
 *
 * The agent never sees any of this. It holds a scoped Allowance key, not a
 * payment method or a PayPal credential.
 *
 * With no PayPal keys set, a simulated gateway stands in so the app still runs
 * offline. The UI always says which one is live.
 */

export interface ChargeInput {
  vaultId: string;
  amountCents: number;
  /** Idempotency key: the Allowance purchase id. Retrying never double-charges. */
  requestId: string;
  description: string;
  merchantName: string;
  lines: { name: string; qty: number; unitCents: number }[];
}

export interface ChargeResult {
  orderId: string;
  captureId: string | null;
  status: string;
}

export interface SetupStart {
  setupTokenId: string;
  approveUrl: string;
}

export interface PayPalGateway {
  readonly mode: "sandbox" | "simulated";
  startVaultSetup(returnUrl: string, cancelUrl: string): Promise<SetupStart>;
  finishVaultSetup(setupTokenId: string): Promise<{ vaultId: string; payerEmail: string | null }>;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | null,
    readonly issue: string | null,
  ) {
    super(message);
  }
}

const money = (cents: number) => (cents / 100).toFixed(2);

class SandboxGateway implements PayPalGateway {
  readonly mode = "sandbox" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly secret: string,
    private readonly base = "https://api-m.sandbox.paypal.com",
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new PayPalError(
        "PayPal rejected the sandbox keys. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
        res.status,
        res.headers.get("paypal-debug-id"),
        null,
      );
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async call<T>(method: string, pathname: string, body: unknown, requestId: string): Promise<T> {
    const res = await fetch(`${this.base}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const debugId = res.headers.get("paypal-debug-id");
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const issue: string | null = json?.details?.[0]?.issue ?? json?.name ?? null;
      const description: string = json?.details?.[0]?.description ?? json?.message ?? `HTTP ${res.status}`;
      throw new PayPalError(`PayPal: ${description}`, res.status, debugId, issue);
    }
    return json as T;
  }

  async startVaultSetup(returnUrl: string, cancelUrl: string): Promise<SetupStart> {
    const res = await this.call<{ id: string; links: { rel: string; href: string }[] }>(
      "POST",
      "/v3/vault/setup-tokens",
      {
        payment_source: {
          paypal: {
            description: "Allowance: lets AI agents you approve pay within limits you set",
            usage_pattern: "IMMEDIATE",
            usage_type: "MERCHANT",
            customer_type: "CONSUMER",
            permit_multiple_payment_tokens: false,
            experience_context: {
              brand_name: "Allowance",
              shipping_preference: "NO_SHIPPING",
              locale: "en-US",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      },
      crypto.randomUUID(),
    );
    const approve = res.links.find((l) => l.rel === "approve");
    if (!approve) throw new PayPalError("PayPal didn't return an approval link.", 502, null, null);
    return { setupTokenId: res.id, approveUrl: approve.href };
  }

  async finishVaultSetup(setupTokenId: string) {
    const res = await this.call<{ id: string; payment_source?: { paypal?: { email_address?: string } } }>(
      "POST",
      "/v3/vault/payment-tokens",
      { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
      `pt-${setupTokenId}`,
    );
    return { vaultId: res.id, payerEmail: res.payment_source?.paypal?.email_address ?? null };
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const itemTotal = input.lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
    if (itemTotal !== input.amountCents) throw new Error("Line items don't add up to the amount.");
    const res = await this.call<{
      id: string;
      status: string;
      purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
    }>(
      "POST",
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.requestId,
            custom_id: input.requestId,
            invoice_id: input.requestId,
            description: input.description.slice(0, 127),
            soft_descriptor: "ALLOWANCE",
            amount: {
              currency_code: "USD",
              value: money(input.amountCents),
              breakdown: { item_total: { currency_code: "USD", value: money(itemTotal) } },
            },
            items: input.lines.map((l) => ({
              name: l.name.slice(0, 127),
              quantity: String(l.qty),
              unit_amount: { currency_code: "USD", value: money(l.unitCents) },
              category: "PHYSICAL_GOODS",
            })),
          },
        ],
        payment_source: { paypal: { vault_id: input.vaultId } },
      },
      input.requestId,
    );
    const capture = res.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
    return { orderId: res.id, captureId: capture?.id ?? null, status: capture?.status ?? res.status };
  }
}

/** Stands in for PayPal when no sandbox keys are set. Labelled "Simulated" everywhere it appears. */
export class SimulatedGateway implements PayPalGateway {
  readonly mode = "simulated" as const;
  readonly charges: ChargeInput[] = [];
  failNext: string | null = null;

  async startVaultSetup(returnUrl: string): Promise<SetupStart> {
    const id = `SIM-SETUP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const url = new URL(returnUrl);
    url.searchParams.set("approval_token_id", id);
    return { setupTokenId: id, approveUrl: url.toString() };
  }

  async finishVaultSetup(setupTokenId: string) {
    return { vaultId: setupTokenId.replace("SETUP", "VAULT"), payerEmail: "sb-buyer@personal.example.com" };
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (this.failNext) {
      const issue = this.failNext;
      this.failNext = null;
      throw new PayPalError(`PayPal: simulated ${issue}`, 422, "SIM-DEBUG", issue);
    }
    this.charges.push(input);
    const id = crypto.createHash("sha256").update(input.requestId).digest("hex").slice(0, 17).toUpperCase();
    return { orderId: `SIM${id}`, captureId: `SIMCAP${id.slice(0, 11)}`, status: "COMPLETED" };
  }
}

const globalForPayPal = globalThis as unknown as { __paypal?: PayPalGateway };

export function paypal(): PayPalGateway {
  if (!globalForPayPal.__paypal) {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    globalForPayPal.__paypal = id && secret ? new SandboxGateway(id, secret) : new SimulatedGateway();
  }
  return globalForPayPal.__paypal;
}

/** Test hook. */
export function setPayPalForTests(gw: PayPalGateway | undefined): void {
  globalForPayPal.__paypal = gw;
}
