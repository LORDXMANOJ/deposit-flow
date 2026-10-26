import type { ZodError } from "zod";

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fail(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (error && typeof error === "object" && "issues" in error) {
    const fieldErrors: Record<string, string> = {};
    for (const i of (error as ZodError).issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  // Surface constraint violations in plain language instead of raw SQL errors.
  if (/duplicate key.*fdr_number/i.test(msg)) return { ok: false, error: "That FDR number is already registered.", fieldErrors: { fdr_number: "Already registered" } };
  if (/violates foreign key/i.test(msg)) return { ok: false, error: "This record is linked to other records and cannot be changed this way." };
  if (/violates check constraint/i.test(msg)) return { ok: false, error: "One of the values is not allowed. Please review the form." };
  if (/NEXT_REDIRECT/.test(msg)) throw error;
  return { ok: false, error: msg };
}
