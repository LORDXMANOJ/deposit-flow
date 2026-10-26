import "server-only";
import { getSetting } from "./alert-engine";

type G = typeof globalThis & { __df_clock_offset_days?: number };

/** Loads the simulated-clock offset from settings into the process (see clockOffsetDays in maturity.ts). */
export async function loadClock(): Promise<number> {
  const days = await getSetting<number>("clock_offset_days", 0);
  (globalThis as G).__df_clock_offset_days = Number.isInteger(days) ? days : 0;
  return (globalThis as G).__df_clock_offset_days!;
}

export function setClockOffset(days: number) {
  (globalThis as G).__df_clock_offset_days = days;
}
