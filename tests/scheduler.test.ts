import { beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Automatic monitoring end to end, without pressing any button: the scheduler tick evaluates the rules,
 * writes persistent alert rows and notifications, records an audit event, and never duplicates.
 */
process.env.DEPOSITFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "depositflow-sched-"));

let db: typeof import("@/lib/db");
let sched: typeof import("@/lib/scheduler");
let clock: typeof import("@/lib/clock");
let m: typeof import("@/lib/maturity");
let fdrId = "";

beforeAll(async () => {
  db = await import("@/lib/db");
  sched = await import("@/lib/scheduler");
  clock = await import("@/lib/clock");
  m = await import("@/lib/maturity");
  await db.getDb();
  // A fresh FDR maturing in 20 days, with its receipt already approved.
  const dep = (await db.one<{ id: string; institution_id: string }>("select id, institution_id from deposits where verification_status='approved' limit 1"))!;
  fdrId = (await db.one<{ id: string }>(
    `insert into fdr_records (deposit_id, institution_id, fdr_number, bank, principal, issue_date, maturity_date, verification_status)
     values ($1,$2,'SCHED-TEST-1','Bank of Demo','500000.00',$3,$4,'approved') returning id`,
    [dep.id, dep.institution_id, m.addDaysISO(m.todayISO(), -345), m.addDaysISO(m.todayISO(), 20)]))!.id;
});

describe("scheduler", () => {
  const t0 = new Date("2026-11-01T09:00:00Z");

  test("first tick runs the rules and creates persistent alerts, notifications and an audit event", async () => {
    const s = await sched.tick(t0);
    expect(s).not.toBeNull();
    expect(s!.created).toBeGreaterThan(0);
    const mine = await db.q<{ threshold: number; status: string }>("select threshold, status from alerts where entity_id=$1 and rule_key='fdr_maturity'", [fdrId]);
    expect(mine).toEqual([{ threshold: 30, status: "open" }]);
    const notified = await db.q("select 1 from notification_events n join alerts a on a.id=n.alert_id where a.entity_id=$1", [fdrId]);
    expect(notified.length).toBeGreaterThan(0);
    const auditRows = await db.q<{ actor_name: string }>("select actor_name from audit_logs where action='alerts.run_checks'");
    expect(auditRows.map((r) => r.actor_name)).toContain("Scheduler (automatic)");
    expect((await sched.lastScheduledRun())?.trigger).toBe("schedule");
  });

  test("a tick inside the interval does nothing", async () => {
    expect(await sched.tick(new Date(t0.getTime() + 60_000))).toBeNull();
  });

  test("the next due tick runs again but creates no duplicates", async () => {
    const before = (await db.q<{ n: number }>("select count(*)::int n from alerts"))[0].n;
    const s = await sched.tick(new Date(t0.getTime() + 16 * 60_000));
    expect(s).not.toBeNull();
    expect(s!.created).toBe(0);
    expect((await db.q<{ n: number }>("select count(*)::int n from alerts"))[0].n).toBe(before);
  });

  test("moving the simulated clock forward 14 days raises the 7-day reminder and retires the 30-day one", async () => {
    clock.setClockOffset(14);
    expect(m.daysUntil(m.addDaysISO(m.todayISO(new Date()), 20), m.todayISO())).toBe(6);
    const s = await sched.tick(new Date(t0.getTime() + 40 * 60_000));
    expect(s!.created).toBeGreaterThan(0);
    const rows = await db.q<{ threshold: number; status: string }>("select threshold, status from alerts where entity_id=$1 and rule_key='fdr_maturity' order by threshold", [fdrId]);
    expect(rows).toEqual([{ threshold: 7, status: "open" }, { threshold: 30, status: "resolved" }]);
    clock.setClockOffset(0);
  });

  test("it can be paused from settings or switched off by environment", async () => {
    await db.q(`insert into system_settings (key, value) values ('scheduler', '{"enabled":false,"interval_minutes":15}') on conflict (key) do update set value=excluded.value`);
    expect(await sched.tick(new Date(t0.getTime() + 24 * 3600_000))).toBeNull();
    await db.q(`update system_settings set value='{"enabled":true,"interval_minutes":15}' where key='scheduler'`);
    process.env.SCHEDULER = "off";
    expect(await sched.tick(new Date(t0.getTime() + 48 * 3600_000))).toBeNull();
    delete process.env.SCHEDULER;
  });
});

describe("hosted cron endpoint", () => {
  const call = async (auth?: string) => {
    const { GET } = await import("@/app/api/cron/run-checks/route");
    return GET(new Request("http://x/api/cron/run-checks", { headers: auth ? { authorization: auth } : {} }));
  };

  test("stays closed without a configured secret, and rejects a wrong one", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything-at-all-long-enough")).status).toBe(401);
    process.env.CRON_SECRET = "a-cron-secret-of-sufficient-length";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer a-cron-secret-of-sufficient-lengtX")).status).toBe(401);
  });

  test("runs the checks with the right secret and records who ran them", async () => {
    process.env.CRON_SECRET = "a-cron-secret-of-sufficient-length";
    const res = await call("Bearer a-cron-secret-of-sufficient-length");
    expect(res.status).toBe(200);
    const rows = await db.q("select 1 from audit_logs where actor_name='Scheduled job (cron)'");
    expect(rows.length).toBe(1);
  });
});
