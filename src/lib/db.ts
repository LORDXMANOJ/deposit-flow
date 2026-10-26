import "server-only";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Demo-mode database: PGlite (real Postgres compiled to WASM) persisted on disk.
 * The SQL in supabase/migrations is plain Postgres, so the same schema runs on Supabase.
 */

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DEPOSITFLOW_DATA_DIR ?? ".data");

type Runner = Pick<PGlite, "query"> | Transaction;
type G = typeof globalThis & { __df_db?: Promise<PGlite> };
const g = globalThis as G;

async function open(): Promise<PGlite> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new PGlite(path.join(DATA_DIR, "pgdata"), {
    parsers: {
      1082: (v: string) => v, // date stays YYYY-MM-DD (no timezone shifts)
      1700: (v: string) => v, // numeric stays a string (no float money)
      20: (v: string) => Number(v), // bigint ids/counts
    },
  });
  await db.waitReady;
  await migrate(db);
  const seeded = await db.query<{ n: number }>("select count(*)::int as n from institutions");
  if (seeded.rows[0].n === 0) {
    const { seedDemo } = await import("./seed");
    await seedDemo(db);
  }
  return db;
}

async function migrate(db: PGlite) {
  await db.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz default now())");
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await db.query("select 1 from _migrations where name = $1", [f]);
    if (done.rows.length) continue;
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    await db.query("insert into _migrations (name) values ($1)", [f]);
  }
}

export function getDb(): Promise<PGlite> {
  if (!g.__df_db) g.__df_db = open();
  return g.__df_db;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = [], run?: Runner): Promise<T[]> {
  const r = run ?? (await getDb());
  const res = await r.query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = [], run?: Runner): Promise<T | null> {
  const rows = await q<T>(sql, params, run);
  return rows[0] ?? null;
}

/** Runs `fn` in a transaction; everything commits or rolls back together. */
export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

/** Admin "reset demo": wipes all data and reseeds. Audit table is truncated via DROP of triggers inside this call only. */
export async function resetDemo(): Promise<void> {
  const db = await getDb();
  await db.exec("drop trigger if exists audit_logs_no_update on audit_logs; drop trigger if exists audit_logs_no_truncate on audit_logs;");
  await db.exec(`truncate institutions, profiles, deposits, fdr_records, documents, document_versions, verification_reviews,
    release_requests, workflow_events, alert_rules, alerts, alert_actions, notification_events, audit_logs, system_settings,
    idempotency_keys restart identity cascade;
    alter sequence inst_seq restart with 1001; alter sequence dep_seq restart with 2001; alter sequence fdr_seq restart with 3001;
    alter sequence rel_seq restart with 4001; alter sequence alert_seq restart with 5001; alter sequence doc_seq restart with 6001;`);
  await db.exec(`create trigger audit_logs_no_update before update or delete on audit_logs for each row execute function audit_logs_immutable();
    create trigger audit_logs_no_truncate before truncate on audit_logs for each statement execute function audit_logs_immutable();`);
  const { seedDemo } = await import("./seed");
  await seedDemo(db);
}
