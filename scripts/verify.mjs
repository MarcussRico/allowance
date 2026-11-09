// End-to-end check through the real input path: clicks, a real press-and-hold,
// and mouse-wheel scrolling in Chromium and WebKit. Screenshots go to verify-output/.
//   node scripts/verify.mjs [baseUrl]
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "verify-output";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

/** Painted text elements whose boxes overlap another painted text element. Includes SVG text. */
async function textOverlaps(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll("h1,h2,h3,p,span,dt,dd,li,button,label,time,text,a,strong,code")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
      if (el.closest(".ag-root-wrapper,.visually-hidden,dialog:not([open]),[aria-hidden='true']")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.childElementCount === 0 && el.textContent.trim().length > 0;
    });
    const boxes = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    const hits = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) hits.push(`${boxes[i].el.textContent.trim().slice(0, 30)} ⟂ ${boxes[j].el.textContent.trim().slice(0, 30)}`);
      }
    return hits;
  });
}

async function wheelScrolls(browserType, label) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE);
  await page.getByRole("heading", { name: "Your allowances" }).waitFor();
  await page.mouse.move(640, 400);
  const before = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.scrollY);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(`${label}: mouse-wheel scrolls the page`, max > 0 && after >= Math.min(max, 200) - 1, `scrollY ${before} → ${after} (max ${max})`);
  await browser.close();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(e.message));

await page.goto(BASE);
await page.getByRole("heading", { name: "Your allowances" }).waitFor();
await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
check("dashboard loads with the seeded allowance", await page.locator(".note__name").first().isVisible());
check("desktop: no horizontal overflow", await noHorizontalOverflow(page));
const overlaps1 = await textOverlaps(page);
check("desktop: no overlapping text", overlaps1.length === 0, overlaps1.slice(0, 4).join(" | "));

// Run the agent on the restock task through the real buttons.
await page.getByRole("button", { name: "Restock + headphones" }).click();
await page.getByRole("button", { name: "Send to agent" }).click();
const engine = await page.locator(".composer__engine").textContent();
console.log(`      agent engine: ${engine}`);

const held = page.getByRole("heading", { name: "Waiting for you" });
await held.waitFor({ timeout: 150_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-held.png`, fullPage: true });
check("an out-of-policy purchase is held for the owner", await held.isVisible());
const paidBefore = await page.locator(".story .slip--completed").count();
check("in-policy groceries were paid before the hold", paidBefore >= 1, `${paidBefore} paid slip(s) in the story`);
check("the pipeline stops the held slip at your rules", (await page.locator(".stage__slip").getAttribute("data-col")) === "1");

// Answer on a phone: open the approval link in a mobile context and press-and-hold.
const state = await page.evaluate(() => fetch("/api/state").then((r) => r.json()));
const heldPurchase = state.purchases.find((p) => p.status === "held");
check("held purchase has an approval link", !!heldPurchase?.approvalPath);
const phoneCtx = await browser.newContext({ ...devices["iPhone 13"] });
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}${heldPurchase.approvalPath}`);
await phone.getByRole("button", { name: /Hold to approve/ }).waitFor();
await phone.screenshot({ path: `${OUT}/03-phone-approve.png`, fullPage: true });
check("phone: no horizontal overflow", await noHorizontalOverflow(phone));
const box = await phone.getByRole("button", { name: /Hold to approve/ }).boundingBox();

// A short tap must NOT approve.
await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await phone.mouse.down();
await phone.waitForTimeout(300);
await phone.mouse.up();
await phone.waitForTimeout(600);
const afterTap = await page.evaluate((id) => fetch("/api/state").then((r) => r.json()).then((s) => s.purchases.find((p) => p.id === id).status), heldPurchase.id);
check("phone: a short tap doesn't approve", afterTap === "held", `status after tap: ${afterTap}`);

// Holding for the full time approves.
await phone.mouse.down();
await phone.waitForTimeout(1500);
await phone.mouse.up();
await phone.getByText(/Approved and paid through PayPal/).waitFor({ timeout: 20_000 });
await phone.screenshot({ path: `${OUT}/04-phone-approved.png`, fullPage: true });
check("phone: press-and-hold approves and pays", true);

// The agent hears the answer and finishes.
await page.locator(".story__kind--decision").first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
check("after approval the slip moves on to PayPal", (await page.locator(".stage__slip").getAttribute("data-col")) === "2");
await page.getByRole("button", { name: "Send to agent" }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/05-after-approval.png`, fullPage: true });
const ledgerRows = await page.locator(".ag-row").count();
check("ledger shows the purchases", ledgerRows >= 2, `${ledgerRows} rows`);
check("ledger shows a PayPal order id", (await page.locator(".ag-cell.mono").filter({ hasText: /\w{6,}/ }).count()) >= 1);

// Revoke, then confirm the agent can't spend from it.
await page.getByRole("button", { name: "Revoke", exact: true }).first().click();
await page.getByRole("button", { name: "Revoke for good" }).click();
await page.locator(".note__status--revoked").first().waitFor();
const key = await page.evaluate(async () => {
  const r = await fetch("/api/allowances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Agent API check", agentName: "Test agent", capCents: 2000, period: "day", perPurchaseCents: 1500, categories: ["groceries"], expiresInDays: 1 }),
  });
  return (await r.json()).agentKey;
});
const allowanceRes = await page.request.get(`${BASE}/api/agent/allowance`, { headers: { Authorization: `Bearer ${key}` } });
check("agent API: a valid key reads its allowance", allowanceRes.status() === 200);
const badRes = await page.request.get(`${BASE}/api/agent/allowance`, { headers: { Authorization: "Bearer alw_key_nope" } });
check("agent API: a wrong key is refused", badRes.status() === 401);
const buy = await page.request.post(`${BASE}/api/agent/purchases`, {
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  data: { shopId: "luckyline", items: [{ sku: "bet-credit-20", qty: 1 }], reason: "test" },
});
check("agent API: a blocked shop is blocked", (await buy.json()).status === "blocked");

await page.reload();
await page.getByRole("heading", { name: "Your allowances" }).waitFor();
await page.screenshot({ path: `${OUT}/06-revoked.png`, fullPage: true });

// Mobile dashboard.
const mctx = await browser.newContext({ ...devices["iPhone SE"] });
const m = await mctx.newPage();
await m.goto(BASE);
await m.getByRole("heading", { name: "Your allowances" }).waitFor();
await m.screenshot({ path: `${OUT}/07-mobile-dashboard.png`, fullPage: true });
check("mobile 320px: no horizontal overflow", await noHorizontalOverflow(m));
const overlapsM = await textOverlaps(m);
check("mobile: no overlapping text", overlapsM.length === 0, overlapsM.slice(0, 4).join(" | "));

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();

await wheelScrolls(chromium, "Chromium");
await wheelScrolls(webkit, "WebKit");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
