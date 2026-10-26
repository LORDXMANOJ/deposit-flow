/**
 * Pure maturity / reminder logic. No I/O here so it can be unit-tested at the boundaries.
 * Dates are calendar dates (YYYY-MM-DD) compared in UTC to avoid timezone drift.
 */

export type MaturityBand = "closed" | "overdue" | "due_today" | "within_7" | "within_15" | "within_30" | "later";

export const DEFAULT_THRESHOLDS = [30, 15, 7, 0] as const;

export function parseDate(d: string): number {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/**
 * Simulated clock for demonstrations: the server may shift "today" by whole days so a judge can watch
 * reminders fire without waiting. Set from Settings, always shown in a banner, 0 by default.
 * Only date-based rules use it; database timestamps (created_at, audit times) stay real.
 */
export function clockOffsetDays(): number {
  return (globalThis as { __df_clock_offset_days?: number }).__df_clock_offset_days ?? 0;
}

export function todayISO(now: Date = new Date(Date.now() + clockOffsetDays() * 86_400_000)): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `today` to `maturity`. Positive = future, 0 = today, negative = past. */
export function daysUntil(maturity: string, today: string): number {
  return Math.round((parseDate(maturity) - parseDate(today)) / 86_400_000);
}

export function addDaysISO(date: string, days: number): string {
  const t = new Date(parseDate(date) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** Lifecycle states in which the FDR no longer needs maturity action. */
export const CLOSED_STATES = new Set(["released", "renewed", "closed", "rejected"]);

/**
 * Band is computed from the date and record state, never from a manually typed label.
 * `thresholds` must be sorted or not, we sort descending here.
 */
export function maturityBand(
  maturity: string,
  today: string,
  state: string,
  thresholds: readonly number[] = DEFAULT_THRESHOLDS,
): MaturityBand {
  if (CLOSED_STATES.has(state)) return "closed";
  const d = daysUntil(maturity, today);
  if (d < 0) return "overdue";
  if (d === 0) return "due_today";
  const sorted = [...thresholds].filter((t) => t > 0).sort((a, b) => a - b);
  const [t1, t2, t3] = [sorted[0] ?? 7, sorted[1] ?? 15, sorted[2] ?? 30];
  if (d <= t1) return "within_7";
  if (d <= t2) return "within_15";
  if (d <= t3) return "within_30";
  return "later";
}

export const BAND_LABEL: Record<MaturityBand, string> = {
  closed: "Closed",
  overdue: "Overdue",
  due_today: "Due today",
  within_7: "Due in ≤ 7 days",
  within_15: "Due in ≤ 15 days",
  within_30: "Due in ≤ 30 days",
  later: "Not yet due",
};

/**
 * Which reminder thresholds are currently due for an FDR.
 * A threshold T (days before maturity) is due when 0 <= daysUntil <= T.
 * Threshold 0 means "on the maturity date". Past maturity returns the special key -1
 * ("after maturity, action still pending").
 * The alert engine inserts one alert per (fdr, threshold) and relies on a unique key,
 * so only the tightest currently-applicable threshold is returned to avoid a burst of
 * 30/15/7 alerts for an FDR first seen at 5 days out.
 */
export function dueThreshold(
  maturity: string,
  today: string,
  state: string,
  thresholds: readonly number[] = DEFAULT_THRESHOLDS,
): number | null {
  if (CLOSED_STATES.has(state)) return null;
  const d = daysUntil(maturity, today);
  if (d < 0) return -1;
  const eligible = [...thresholds].filter((t) => d <= t).sort((a, b) => a - b);
  return eligible.length ? eligible[0] : null;
}

export function severityForThreshold(t: number): "info" | "warning" | "high" | "critical" {
  if (t < 0) return "critical";
  if (t === 0) return "critical";
  if (t <= 7) return "high";
  if (t <= 15) return "warning";
  return "info";
}
