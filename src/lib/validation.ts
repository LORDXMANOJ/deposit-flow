import { z } from "zod";
import { isValidAmount } from "./money";

/** Shared by client forms (react-hook-form) and server actions, so rules cannot drift apart. */

export const CATEGORIES = ["Engineering", "Management", "Pharmacy", "Architecture", "Polytechnic", "Other"] as const;
export const DEPOSIT_TYPES = ["Security Deposit", "Performance Guarantee", "Earnest Money", "Other"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const amount = z.string().trim().refine(isValidAmount, "Enter a valid amount, up to 2 decimals").refine((v) => Number(v) > 0, "Amount must be greater than zero");
const idemKey = z.string().uuid().optional();

export const institutionSchema = z.object({
  name: z.string().trim().min(3, "Enter the institution name"),
  category: z.enum(CATEGORIES),
  aicte_ref: z.string().trim().max(40).optional().or(z.literal("")),
  state: z.string().trim().min(2, "State is required"),
  district: z.string().trim().min(2, "District is required"),
  contact_name: z.string().trim().min(2, "Contact name is required"),
  contact_email: z.string().trim().email("Enter a valid email"),
  contact_phone: z.string().trim().regex(/^[+\d][\d\s-]{7,16}$/, "Enter a valid phone number"),
  status: z.enum(["active", "inactive", "suspended"]),
  idempotency_key: idemKey,
});
export type InstitutionInput = z.infer<typeof institutionSchema>;

export const depositSchema = z.object({
  institution_id: z.string().uuid("Select an institution"),
  deposit_type: z.enum(DEPOSIT_TYPES),
  principal: amount,
  deposit_date: isoDate,
  bank: z.string().trim().min(2, "Issuing bank is required"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  // Optional linked FDR created together with the deposit
  fdr_number: z.string().trim().max(40).optional().or(z.literal("")),
  issue_date: isoDate.optional().or(z.literal("")),
  maturity_date: isoDate.optional().or(z.literal("")),
  idempotency_key: idemKey,
}).superRefine((v, ctx) => {
  const hasFdr = !!v.fdr_number;
  if (hasFdr) {
    if (!v.issue_date) ctx.addIssue({ code: "custom", path: ["issue_date"], message: "Issue date is required with an FDR" });
    if (!v.maturity_date) ctx.addIssue({ code: "custom", path: ["maturity_date"], message: "Maturity date is required with an FDR" });
    if (v.issue_date && v.maturity_date && v.maturity_date <= v.issue_date)
      ctx.addIssue({ code: "custom", path: ["maturity_date"], message: "Maturity must be after the issue date" });
  } else if (v.issue_date || v.maturity_date) {
    ctx.addIssue({ code: "custom", path: ["fdr_number"], message: "Enter the FDR number or clear the dates" });
  }
});
export type DepositInput = z.infer<typeof depositSchema>;

export const releaseSchema = z.object({
  deposit_id: z.string().uuid("Select a deposit"),
  reason: z.string().trim().min(10, "Describe the reason (at least 10 characters)").max(1000),
  idempotency_key: idemKey,
});
export type ReleaseInput = z.infer<typeof releaseSchema>;

export const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  remarks: z.string().trim().max(1000).optional().or(z.literal("")),
}).superRefine((v, ctx) => {
  if (v.decision !== "approved" && !v.remarks)
    ctx.addIssue({ code: "custom", path: ["remarks"], message: "Remarks are required when rejecting or requesting changes" });
});

export const settingsSchema = z.object({
  thresholds: z.string().trim().refine((s) => s.split(",").every((x) => /^\d{1,3}$/.test(x.trim())), "Comma-separated whole days, e.g. 30,15,7,0"),
  max_file_mb: z.coerce.number().int().min(1).max(25),
  verification_pending_days: z.coerce.number().int().min(1).max(60),
  release_sla_days: z.coerce.number().int().min(1).max(90),
});
