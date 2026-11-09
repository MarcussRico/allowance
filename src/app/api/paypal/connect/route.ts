import { json, problem } from "@/lib/http";
import { paypal, PayPalError } from "@/lib/paypal";
import { currentWorkspaceId } from "@/lib/session";
import { setPendingSetupToken } from "@/lib/store";
import { appUrl } from "@/lib/urls";

/** Starts saving the owner's PayPal: returns PayPal's approval page to send them to. */
export async function POST(req: Request) {
  const ws = await currentWorkspaceId();
  const origin = appUrl(req);
  try {
    const { setupTokenId, approveUrl } = await paypal().startVaultSetup(`${origin}/paypal/return`, `${origin}/?paypal=cancelled`);
    setPendingSetupToken(ws, setupTokenId);
    return json({ approveUrl });
  } catch (err) {
    const msg = err instanceof PayPalError ? err.message : "Couldn't reach PayPal.";
    return problem(502, msg);
  }
}
