import "server-only";
import { q } from "./db";
import { runChecks, getSetting, type RunSummary } from "./alert-engine";

/**
 * Automatic monitoring. A single in-process timer wakes every 30 seconds and runs the same
 * runChecks() the "Run checks now" button uses whenever the configured interval has passed.
 * Every run creates persistent alert rows (deduplicated by key) and an audit event whose actor is
 * "Scheduler (automatic)". Works on a long-running Node server (npm start / npm run dev).
 * Serverless hosts cannot keep a timer alive; there, call /api/cron/run-checks from the platform's cron.
 */

export const SCHEDULER_ACTOR = { id: null, name: "Scheduler (automatic)", role: "system" as const };

export type SchedulerConfig = { enabled: boolean; interval_minutes: number };
export type LastRun = { at: string; trigger: string; created: number; candidates: number; autoResolved: number; escalated: number };

export async function schedulerConfig(): Promise<SchedulerConfig> {
  const c = await getSetting<Partial<SchedulerConfig>>("scheduler", {});
  return { enabled: c.enabled ?? true, interval_minutes: Math.max(1, Math.min(1440, c.interval_minutes ?? 15)) };
}

export async function lastScheduledRun(): Promise<LastRun | null> {
  return getSetting<LastRun | null>("scheduler_last_run", null);
}

/** One scheduler step. Exported so tests can drive it with a fixed `now`. Returns the summary when it ran. */
export async function tick(now: Date = new Date()): Promise<RunSummary | null> {
  if (process.env.SCHEDULER === "off") return null;
  const cfg = await schedulerConfig();
  if (!cfg.enabled) return null;
  const last = await lastScheduledRun();
  if (last && now.getTime() - new Date(last.at).getTime() < cfg.interval_minutes * 60_000) return null;
  // Claim this slot before running so two overlapping ticks cannot both run.
  await recordRun({ at: now.toISOString(), trigger: "schedule", created: 0, candidates: 0, autoResolved: 0, escalated: 0 });
  const s = await runChecks(SCHEDULER_ACTOR);
  await recordRun({ at: now.toISOString(), trigger: "schedule", created: s.created, candidates: s.candidates, autoResolved: s.autoResolved, escalated: s.escalated });
  return s;
}

export async function recordRun(r: LastRun) {
  await q(`insert into system_settings (key, value, updated_at) values ('scheduler_last_run', $1, now())
           on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(r)]);
}

type G = typeof globalThis & { __df_scheduler?: ReturnType<typeof setInterval> };

export function startScheduler() {
  const g = globalThis as G;
  if (g.__df_scheduler || process.env.SCHEDULER === "off") return;
  const run = () => tick().catch((e) => console.error("[scheduler] run failed:", e instanceof Error ? e.message : e));
  setTimeout(run, 8_000); // first pass shortly after start-up
  g.__df_scheduler = setInterval(run, 30_000);
  console.log("[scheduler] automatic alert checks enabled");
}
