/**
 * Demo merchants the agent shops at. Prices live here, on the server: the agent
 * names items, never amounts, so it can't claim a $89 purchase costs $9.
 */

export interface CatalogItem {
  sku: string;
  name: string;
  priceCents: number;
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  blurb: string;
  items: CatalogItem[];
}

export const MERCHANTS: Merchant[] = [
  {
    id: "corner-grocer",
    name: "Corner Grocer",
    category: "groceries",
    blurb: "Neighbourhood grocery, same-day delivery",
    items: [
      { sku: "oat-milk-1l", name: "Oat milk, 1 L", priceCents: 349 },
      { sku: "eggs-12", name: "Free-range eggs, 12", priceCents: 429 },
      { sku: "sourdough", name: "Sourdough loaf", priceCents: 580 },
      { sku: "spinach-250", name: "Baby spinach, 250 g", priceCents: 299 },
      { sku: "coffee-beans-500", name: "Coffee beans, 500 g", priceCents: 1150 },
      { sku: "bananas", name: "Bananas, bunch", priceCents: 189 },
      { sku: "basmati-2kg", name: "Basmati rice, 2 kg", priceCents: 620 },
    ],
  },
  {
    id: "paper-lantern",
    name: "Paper Lantern Books",
    category: "books",
    blurb: "Independent bookshop",
    items: [
      { sku: "bk-salt-path-home", name: "The Long Way to the Tide (paperback)", priceCents: 1499 },
      { sku: "bk-orchard-maps", name: "Maps of a Quiet Orchard (hardback)", priceCents: 2400 },
      { sku: "bk-kitchen-basics", name: "Weeknight Kitchen Basics", priceCents: 1850 },
    ],
  },
  {
    id: "voltline",
    name: "Voltline Electronics",
    category: "electronics",
    blurb: "Consumer electronics",
    items: [
      { sku: "nc-headphones", name: "Noise-cancelling headphones", priceCents: 8900 },
      { sku: "usb-c-65w", name: "USB-C charger, 65 W", priceCents: 2400 },
      { sku: "hdmi-2m", name: "HDMI cable, 2 m", priceCents: 1200 },
    ],
  },
  {
    id: "greenleaf",
    name: "Greenleaf Pharmacy",
    category: "health",
    blurb: "Pharmacy and everyday health",
    items: [
      { sku: "vit-d", name: "Vitamin D, 90 tablets", priceCents: 940 },
      { sku: "cold-relief", name: "Cold and flu relief", priceCents: 780 },
    ],
  },
  {
    id: "luckyline",
    name: "LuckyLine Bets",
    category: "gambling",
    blurb: "Online betting credits",
    items: [{ sku: "bet-credit-20", name: "Betting credit", priceCents: 2000 }],
  },
];

export function findMerchant(id: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.id === id);
}

export interface PricedLine {
  sku: string;
  name: string;
  qty: number;
  unitCents: number;
  lineCents: number;
}

export type PriceResult =
  | { ok: true; merchant: Merchant; lines: PricedLine[]; totalCents: number }
  | { ok: false; error: string };

/** Price a basket from the catalog. Unknown shops, items or quantities are errors, not guesses. */
export function priceBasket(merchantId: string, items: { sku: string; qty: number }[]): PriceResult {
  const merchant = findMerchant(merchantId);
  if (!merchant) return { ok: false, error: `There's no shop with the id "${merchantId}".` };
  if (items.length === 0) return { ok: false, error: "The basket is empty." };
  const lines: PricedLine[] = [];
  for (const { sku, qty } of items) {
    const item = merchant.items.find((i) => i.sku === sku);
    if (!item) return { ok: false, error: `${merchant.name} doesn't sell "${sku}".` };
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      return { ok: false, error: `Quantity for ${item.name} must be a whole number from 1 to 20.` };
    }
    lines.push({ sku, name: item.name, qty, unitCents: item.priceCents, lineCents: item.priceCents * qty });
  }
  return { ok: true, merchant, lines, totalCents: lines.reduce((s, l) => s + l.lineCents, 0) };
}

export function searchCatalog(query: string): { merchant: Merchant; item: CatalogItem }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: { merchant: Merchant; item: CatalogItem; score: number }[] = [];
  for (const merchant of MERCHANTS) {
    for (const item of merchant.items) {
      const hay = `${item.name} ${merchant.name} ${merchant.category}`.toLowerCase();
      const score = words.filter((w) => hay.includes(w.replace(/s$/, ""))).length;
      if (score > 0) hits.push({ merchant, item, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}
