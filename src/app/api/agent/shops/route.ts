import { authenticateAgent } from "@/lib/agent-auth";
import { searchCatalog } from "@/lib/catalog";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const a = authenticateAgent(req);
  if (a instanceof Response) return a;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({
    results: searchCatalog(q).map(({ merchant, item }) => ({
      shopId: merchant.id,
      shop: merchant.name,
      category: merchant.category,
      sku: item.sku,
      name: item.name,
      priceCents: item.priceCents,
    })),
  });
}
