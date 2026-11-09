export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const PERIOD_WORD = { day: "today", week: "this week", month: "this month" } as const;

export const STATUS_LABEL: Record<string, string> = {
  completed: "Paid",
  charging: "Paying…",
  held: "Waiting for you",
  declined: "Declined",
  blocked: "Blocked",
  failed: "Didn't go through",
  expired: "Expired",
};
