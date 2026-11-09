// Creates (or updates and redeploys) the Allowance web service on Render, then waits until it's live.
//   RENDER_API_KEY=rnd_... node scripts/deploy-render.mjs
// Reads RENDER_API_KEY and the app's keys from the environment or .env.local. Never prints a secret.
import fs from "node:fs";

const API = "https://api.render.com/v1";
const NAME = "allowance";
const REPO = "https://github.com/MarcussRico/allowance";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
const local = loadEnvFile(".env.local");
const get = (k) => process.env[k] || local[k] || "";

const KEY = get("RENDER_API_KEY");
if (!KEY) {
  console.error("Set RENDER_API_KEY (Render dashboard → Account settings → API keys).");
  process.exit(1);
}

async function render(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Render ${method} ${path} → ${res.status}: ${json?.message ?? text.slice(0, 300)}`);
  return json;
}

// App settings. Secrets are sent only if set locally; empty ones are left out so the app falls back cleanly.
const envVars = [
  { key: "NODE_VERSION", value: "26" },
  { key: "ALLOWANCE_DB", value: "/var/data/allowance.db" },
  { key: "MAX_RUNS_PER_DAY", value: "300" },
  ...["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "DEMO_VAULT_ID", "ANTHROPIC_API_KEY"]
    .filter((k) => get(k))
    .map((k) => ({ key: k, value: get(k) })),
];
console.log(`Settings to send: ${envVars.map((e) => e.key).join(", ")}`);

const owners = await render("GET", "/owners?limit=20");
const owner = owners[0]?.owner;
if (!owner) throw new Error("No Render workspace found for this API key.");
console.log(`Render workspace: ${owner.name}`);

const existing = (await render("GET", `/services?name=${NAME}&ownerId=${owner.id}&limit=20`)).map((x) => x.service).find((s) => s.name === NAME);

let serviceId;
let deployId;
if (!existing) {
  const created = await render("POST", "/services", {
    type: "web_service",
    name: NAME,
    ownerId: owner.id,
    repo: REPO,
    branch: "main",
    autoDeployTrigger: "commit",
    envVars,
    serviceDetails: {
      runtime: "node",
      plan: process.env.RENDER_PLAN || "starter",
      region: process.env.RENDER_REGION || "singapore",
      numInstances: 1,
      healthCheckPath: "/api/health",
      disk: { name: "data", mountPath: "/var/data", sizeGB: 1 },
      envSpecificDetails: { buildCommand: "npm ci && npm run build", startCommand: "npm start" },
    },
  });
  serviceId = created.service.id;
  deployId = created.deployId;
  console.log(`Created service ${serviceId}`);
} else {
  serviceId = existing.id;
  await render("PUT", `/services/${serviceId}/env-vars`, envVars);
  deployId = (await render("POST", `/services/${serviceId}/deploys`, {})).id;
  console.log(`Updated settings on ${serviceId} and started a new deploy`);
}

const service = await render("GET", `/services/${serviceId}`);
const url = service.serviceDetails?.url;
console.log(`Dashboard: ${service.dashboardUrl}`);

const started = Date.now();
for (;;) {
  const d = await render("GET", `/services/${serviceId}/deploys/${deployId}`);
  const status = d.status;
  process.stdout.write(`\r  deploy ${deployId}: ${status} (${Math.round((Date.now() - started) / 1000)}s)   `);
  if (status === "live") break;
  if (["build_failed", "update_failed", "canceled", "pre_deploy_failed", "deactivated"].includes(status)) {
    console.log(`\nDeploy ${status}. Open the dashboard above for the build log.`);
    process.exit(1);
  }
  if (Date.now() - started > 20 * 60 * 1000) {
    console.log("\nStill not live after 20 minutes. Check the dashboard.");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log(`\nLive: ${url}`);
