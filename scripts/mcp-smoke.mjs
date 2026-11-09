// Starts the Allowance MCP server over stdio and calls its tools like Claude Desktop would.
//   node scripts/mcp-smoke.mjs [baseUrl]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BASE = process.argv[2] ?? "http://localhost:3000";
// A browser visit gives us a workspace cookie; then create an allowance to get an agent key.
const home = await fetch(BASE, { redirect: "manual" });
const cookie = home.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
await fetch(`${BASE}/api/state`, { headers: { cookie } });
const created = await fetch(`${BASE}/api/allowances`, {
  method: "POST",
  headers: { cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "MCP smoke test", agentName: "Claude Desktop", capCents: 3000, period: "day", perPurchaseCents: 2000, categories: ["groceries"], expiresInDays: 1 }),
}).then((r) => r.json());

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "mcp/server.mts"],
  env: { ...process.env, ALLOWANCE_URL: BASE, ALLOWANCE_AGENT_KEY: created.agentKey, ALLOWANCE_WAIT_MS: "2000" },
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("tools:", tools.join(", "));
const show = (r) => r.content.map((c) => c.text).join("\n");
console.log("check_allowance →", show(await client.callTool({ name: "check_allowance", arguments: {} })));
console.log("buy (in policy) →", show(await client.callTool({ name: "buy", arguments: { shop_id: "corner-grocer", items: [{ sku: "bananas", qty: 2 }], reason: "smoke test" } })));
console.log("buy (held) →", show(await client.callTool({ name: "buy", arguments: { shop_id: "voltline", items: [{ sku: "hdmi-2m", qty: 1 }], reason: "smoke test" } })));
console.log("buy (blocked) →", show(await client.callTool({ name: "buy", arguments: { shop_id: "luckyline", items: [{ sku: "bet-credit-20", qty: 1 }], reason: "smoke test" } })));
await client.close();
