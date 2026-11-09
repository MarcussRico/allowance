import { paypal, PayPalError } from "@/lib/paypal";
import { currentWorkspaceId } from "@/lib/session";
import { connectVault, getWorkspace } from "@/lib/store";
import { appUrl } from "@/lib/urls";

/** PayPal sends the owner back here after they approve saving their account. */
export async function GET(req: Request) {
  const ws = await currentWorkspaceId();
  const origin = appUrl(req);
  const token = new URL(req.url).searchParams.get("approval_token_id");
  const pending = getWorkspace(ws)?.pendingSetupToken;
  if (!token || token !== pending) return Response.redirect(`${origin}/app?paypal=mismatch`, 303);
  try {
    const { vaultId, payerEmail } = await paypal().finishVaultSetup(token);
    connectVault(ws, vaultId, payerEmail);
    return Response.redirect(`${origin}/app?paypal=connected`, 303);
  } catch (err) {
    const reason = err instanceof PayPalError && err.issue ? err.issue : "failed";
    return Response.redirect(`${origin}/app?paypal=${encodeURIComponent(reason)}`, 303);
  }
}
