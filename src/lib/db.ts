import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * One SQLite file holds everything. Every row belongs to a workspace, so each
 * visitor to the hosted demo gets their own allowances and ledger.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  vault_id TEXT,
  payer_email TEXT,
  pending_setup_token TEXT,
  runs_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allowances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_key_hash TEXT NOT NULL UNIQUE,
  agent_key_hint TEXT NOT NULL,
  cap_cents INTEGER NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('day','week','month')),
  per_purchase_cents INTEGER NOT NULL,
  categories TEXT NOT NULL,
  merchants_allowed TEXT NOT NULL DEFAULT '[]',
  merchants_blocked TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','paused','revoked')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  allowance_id TEXT NOT NULL REFERENCES allowances(id),
  run_id TEXT,
  merchant_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  category TEXT NOT NULL,
  lines TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  agent_note TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK (outcome IN ('allow','hold','block')),
  status TEXT NOT NULL CHECK (status IN ('charging','completed','held','declined','blocked','failed','expired')),
  reasons TEXT NOT NULL DEFAULT '[]',
  approval_token TEXT UNIQUE,
  approved_by_owner INTEGER NOT NULL DEFAULT 0,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  paypal_status TEXT,
  paypal_debug_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS purchases_by_allowance ON purchases(allowance_id, created_at);
CREATE INDEX IF NOT EXISTS purchases_by_workspace ON purchases(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  allowance_id TEXT NOT NULL REFERENCES allowances(id),
  task TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('claude','scripted')),
  status TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS run_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT
);
CREATE INDEX IF NOT EXISTS run_events_by_run ON run_events(run_id, seq);
`;

function open(): DatabaseSync {
  const file = process.env.ALLOWANCE_DB ?? path.join(process.cwd(), ".data", "allowance.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __allowanceDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__allowanceDb) globalForDb.__allowanceDb = open();
  return globalForDb.__allowanceDb;
}

/** Test hook: start from an empty database. */
export function resetDbForTests(): void {
  globalForDb.__allowanceDb?.close();
  globalForDb.__allowanceDb = undefined;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}
