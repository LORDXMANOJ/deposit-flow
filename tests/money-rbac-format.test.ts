import { describe, expect, test } from "vitest";
import { formatINR, formatINRCompact, fromPaise, isValidAmount, sumAmounts, toPaise } from "@/lib/money";
import { can, assertCan, ForbiddenError, ROLES } from "@/lib/rbac";
import { csvEscape, toCsv } from "@/lib/format";
import { depositSchema, reviewSchema } from "@/lib/validation";

describe("money: decimal-safe, never floating point", () => {
  test("0.1 + 0.2 is exactly 0.30", () => {
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
  });
  test("large values keep every paisa", () => {
    expect(sumAmounts(["99999999999999.99", "0.01"])).toBe("100000000000000.00");
    expect(fromPaise(toPaise("12345678.5"))).toBe("12345678.50");
  });
  test("Indian digit grouping", () => {
    expect(formatINR("12345678.5")).toBe("₹1,23,45,678.50");
    expect(formatINR("999")).toBe("₹999.00");
    expect(formatINRCompact("121800002.00")).toBe("₹12.18 Cr");
    expect(formatINRCompact("325000")).toBe("₹3.25 L");
  });
  test("amount validation rejects floats with >2 decimals, negatives and junk", () => {
    expect(isValidAmount("100.5")).toBe(true);
    expect(isValidAmount("100.555")).toBe(false);
    expect(isValidAmount("-5")).toBe(false);
    expect(isValidAmount("1e6")).toBe(false);
  });
});

describe("role permissions", () => {
  test("auditor is read-only", () => {
    for (const p of ["deposit.write", "document.review", "release.review", "release.process", "settings.manage"] as const)
      expect(can("auditor", p)).toBe(false);
    expect(can("auditor", "audit.read")).toBe(true);
  });
  test("only verifiers and admins can review documents", () => {
    expect(ROLES.filter((r) => can(r, "document.review"))).toEqual(["admin", "verifier"]);
  });
  test("only finance and admins can process releases", () => {
    expect(ROLES.filter((r) => can(r, "release.process"))).toEqual(["admin", "finance"]);
  });
  test("institution users cannot export or read the audit trail", () => {
    expect(can("institution", "report.export")).toBe(false);
    expect(can("institution", "audit.read")).toBe(false);
  });
  test("assertCan throws a ForbiddenError", () => {
    expect(() => assertCan("auditor", "deposit.write")).toThrow(ForbiddenError);
    expect(() => assertCan(null, "deposit.read")).toThrow(ForbiddenError);
  });
});

describe("CSV export safety", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
  });
  test("neutralises spreadsheet formula injection", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvEscape("+91 90000")).toBe("'+91 90000");
  });
  test("builds CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,");
  });
});

describe("validation", () => {
  const base = { institution_id: "6f1c1b0e-8a7b-4b8e-9c36-0e8b1f0c1a11", deposit_type: "Security Deposit", principal: "2500000", deposit_date: "2026-10-01", bank: "State Bank of Demo" };
  test("maturity must be after issue when an FDR is given", () => {
    const r = depositSchema.safeParse({ ...base, fdr_number: "DEMO-1", issue_date: "2026-10-01", maturity_date: "2026-10-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["maturity_date"]);
  });
  test("dates without an FDR number are rejected", () => {
    expect(depositSchema.safeParse({ ...base, maturity_date: "2027-01-01" }).success).toBe(false);
  });
  test("zero and malformed principals are rejected", () => {
    expect(depositSchema.safeParse({ ...base, principal: "0" }).success).toBe(false);
    expect(depositSchema.safeParse({ ...base, principal: "12.345" }).success).toBe(false);
  });
  test("rejecting a document requires remarks", () => {
    expect(reviewSchema.safeParse({ decision: "rejected", remarks: "" }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "approved" }).success).toBe(true);
  });
});
