import { describe, expect, test } from "vitest";
import { addDaysISO, daysUntil, dueThreshold, maturityBand, severityForThreshold } from "@/lib/maturity";

const T = "2026-10-26";
const at = (n: number) => addDaysISO(T, n);

describe("maturity band (computed from date + state, never from a label)", () => {
  test.each([
    [-1, "overdue"],
    [0, "due_today"],
    [1, "within_7"],
    [7, "within_7"],
    [8, "within_15"],
    [15, "within_15"],
    [16, "within_30"],
    [30, "within_30"],
    [31, "later"],
  ])("FDR maturing in %i days is %s", (offset, band) => {
    expect(maturityBand(at(offset), T, "active")).toBe(band);
  });

  test("closed lifecycle states are never flagged, even when past maturity", () => {
    for (const s of ["released", "renewed", "closed"]) expect(maturityBand(at(-10), T, s)).toBe("closed");
  });

  test("daysUntil is timezone-safe across a month boundary", () => {
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("reminder threshold selection", () => {
  const th = [30, 15, 7, 0];
  test.each([
    [0, 0], // on the maturity date
    [1, 7], // tomorrow
    [7, 7], // exactly 7 days
    [8, 15], // just outside the 7-day threshold
    [30, 30],
    [31, null], // just outside the widest threshold
    [-3, -1], // after maturity, still pending
  ])("%i days out -> threshold %s", (offset, expected) => {
    expect(dueThreshold(at(offset), T, "active", th)).toBe(expected);
  });

  test("respects configured thresholds", () => {
    expect(dueThreshold(at(10), T, "active", [45, 10])).toBe(10);
    expect(dueThreshold(at(11), T, "active", [45, 10])).toBe(45);
  });

  test("closed FDRs get no reminders", () => {
    expect(dueThreshold(at(3), T, "released", th)).toBeNull();
  });

  test("severity escalates as maturity approaches", () => {
    expect(severityForThreshold(30)).toBe("info");
    expect(severityForThreshold(15)).toBe("warning");
    expect(severityForThreshold(7)).toBe("high");
    expect(severityForThreshold(0)).toBe("critical");
    expect(severityForThreshold(-1)).toBe("critical");
  });
});
