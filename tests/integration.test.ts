import { beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Runs against a real, throwaway PGlite database with the actual migrations and seed.
 * Environment must be set before the db module is imported.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "depositflow-test-"));
process.env.DEPOSITFLOW_DATA_DIR = dir;

type Db = typeof import("@/lib/db");
let db: Db;
let engine: typeof import("@/lib/alert-engine");
let idem: typeof import("@/lib/idempotency");
let reports: typeof import("@/lib/reports");
let storage: typeof import("@/lib/storage");
let auth: typeof import("@/lib/auth");
const system = { id: null, name: "Test runner", role: "system" as const };

beforeAll(async () => {
  db = await import("@/lib/db");
  engine = await import("@/lib/alert-engine");
  idem = await import("@/lib/idempotency");
  reports = await import("@/lib/reports");
  storage = await import("@/lib/storage");
  auth = await import("@/lib/auth");
  await db.getDb();
});

describe("seed data", () => {
  test("is synthetic and covers the boundary maturity dates", async () => {
    const { todayISO, addDaysISO } = await import("@/lib/maturity");
    const t = todayISO();
    const rows = await db.q<{ maturity_date: string }>("select maturity_date from fdr_records");
    const dates = new Set(rows.map((r) => r.maturity_date));
    for (const off of [0, 1, 7, 8, 31]) expect(dates.has(addDaysISO(t, off))).toBe(true);
    const real = await db.q("select 1 from institutions where not is_demo");
    expect(real).toHaveLength(0);
  });
});

describe("alert engine", () => {
  test("creates alerts from real rules, then is idempotent on a second run", async () => {
    const first = await engine.runChecks(system);
    expect(first.created).toBeGreaterThan(0);
    expect(first.byRule.fdr_maturity).toBeGreaterThan(0);
    expect(first.byRule.missing_document).toBeGreaterThan(0);
    expect(first.byRule.register_mismatch).toBe(1);
    const before = await db.q<{ n: number }>("select count(*)::int as n from alerts");
    const second = await engine.runChecks(system);
    expect(second.created).toBe(0);
    const after = await db.q<{ n: number }>("select count(*)::int as n from alerts");
    expect(after[0].n).toBe(before[0].n);
  });

  test("the database itself refuses a duplicate alert key", async () => {
    const [a] = await db.q<{ dedupe_key: string; rule_key: string; entity_id: string }>("select dedupe_key, rule_key, entity_id from alerts limit 1");
    await expect(db.q(
      "insert into alerts (rule_key, entity_type, entity_id, severity, title, message, assigned_role, dedupe_key) values ($1,'fdr',$2,'info','x','y','finance',$3)",
      [a.rule_key, a.entity_id, a.dedupe_key])).rejects.toThrow(/duplicate key/);
  });

  test("a due-today FDR gets a critical on-maturity alert", async () => {
    const { todayISO } = await import("@/lib/maturity");
    const rows = await db.q<{ severity: string; threshold: number }>(
      "select a.severity, a.threshold from alerts a join fdr_records f on f.id=a.entity_id where a.rule_key='fdr_maturity' and f.maturity_date=$1", [todayISO()]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.threshold === 0 && r.severity === "critical")).toBe(true);
  });

  test("maturity alerts notify the institution's own users, not other institutions", async () => {
    const leaks = await db.q(`select 1 from notification_events n join profiles p on p.id=n.user_id join alerts a on a.id=n.alert_id
      where p.role='institution' and a.institution_id is distinct from p.institution_id`);
    expect(leaks).toHaveLength(0);
  });
});

describe("audit trail", () => {
  test("is append-only: updates and deletes are rejected by the database", async () => {
    await expect(db.q("update audit_logs set actor_name='tampered'")).rejects.toThrow(/append-only/);
    await expect(db.q("delete from audit_logs")).rejects.toThrow(/append-only/);
  });
  test("running checks wrote an audit event", async () => {
    const rows = await db.q("select 1 from audit_logs where action='alerts.run_checks'");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("idempotency keys", () => {
  test("a retried create returns the first result instead of creating twice", async () => {
    const key = crypto.randomUUID();
    let calls = 0;
    const make = async () => { calls++; return { id: "x" + calls }; };
    const a = await idem.withIdempotency(key, "test.create", make);
    const b = await idem.withIdempotency(key, "test.create", make);
    expect(calls).toBe(1);
    expect(b).toEqual({ id: a.id, replayed: true });
  });
  test("a failed attempt releases the key so the user can retry", async () => {
    const key = crypto.randomUUID();
    await expect(idem.withIdempotency(key, "test.fail", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const ok = await idem.withIdempotency(key, "test.fail", async () => ({ ok: 1 }));
    expect(ok).toEqual({ ok: 1 });
  });
  test("a key cannot be reused for a different action", async () => {
    const key = crypto.randomUUID();
    await idem.withIdempotency(key, "scope.a", async () => ({ v: 1 }));
    await expect(idem.withIdempotency(key, "scope.b", async () => ({ v: 2 }))).rejects.toThrow(/different action/);
  });
});

describe("authorization scope", () => {
  test("an institution user's reports and exports contain only their institution", async () => {
    const [p] = await db.q<{ id: string; email: string; full_name: string; institution_id: string }>("select id, email, full_name, institution_id from profiles where role='institution' limit 1");
    const user = { id: p.id, email: p.email, name: p.full_name, role: "institution" as const, institutionId: p.institution_id };
    const [inst] = await db.q<{ name: string }>("select name from institutions where id=$1", [p.institution_id]);
    const rows = await reports.getReport("deposit_register")!.run(user, {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.institution === inst.name)).toBe(true);
    // A forged institution filter must not widen the scope.
    const [other] = await db.q<{ id: string }>("select id from institutions where id <> $1 limit 1", [p.institution_id]);
    const forged = await reports.getReport("deposit_register")!.run(user, { institution: other.id });
    expect(forged.every((r) => r.institution === inst.name)).toBe(true);
  });

  test("record access check rejects another institution's record", async () => {
    const u = { id: "u", email: "e", name: "n", role: "institution" as const, institutionId: "11111111-1111-1111-1111-111111111111" };
    expect(() => auth.assertInstitutionAccess(u, "22222222-2222-2222-2222-222222222222")).toThrow(/another institution/);
    expect(() => auth.assertInstitutionAccess({ ...u, role: "auditor" }, "22222222-2222-2222-2222-222222222222")).not.toThrow();
  });
});

describe("demo reset", () => {
  test("wipes everything, reseeds, and keeps the audit trail append-only afterwards", async () => {
    await db.resetDemo();
    const [c] = await db.q<{ inst: number; alerts: number; audit: number }>(
      "select (select count(*)::int from institutions) as inst, (select count(*)::int from alerts) as alerts, (select count(*)::int from audit_logs) as audit");
    expect(c).toEqual({ inst: 14, alerts: 0, audit: 1 });
    await expect(db.q("delete from audit_logs")).rejects.toThrow(/append-only/);
  });
});

describe("document storage", () => {
  test("file type is decided from content, not the extension", () => {
    expect(storage.sniffMime(Buffer.from("%PDF-1.4 hello"))).toBe("application/pdf");
    expect(storage.sniffMime(Buffer.from("MZ executable renamed to .pdf"))).toBeNull();
    expect(storage.sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
  });
  test("signed file links are bound to the user and file version", () => {
    const tok = storage.signFileToken("ver-1", "user-1");
    expect(storage.verifyFileToken(tok, "ver-1", "user-1")).toBe(true);
    expect(storage.verifyFileToken(tok, "ver-1", "user-2")).toBe(false);
    expect(storage.verifyFileToken(tok, "ver-2", "user-1")).toBe(false);
    expect(storage.verifyFileToken(storage.signFileToken("ver-1", "user-1", -5), "ver-1", "user-1")).toBe(false);
  });
  test("storage keys cannot traverse paths", () => {
    expect(() => storage.readFile("../../etc/passwd")).toThrow(/Invalid storage key/);
  });
});
