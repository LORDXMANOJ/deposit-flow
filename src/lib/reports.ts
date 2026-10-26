import "server-only";
import { q } from "./db";
import type { SessionUser } from "./auth";
import { isScoped, type Permission } from "./rbac";
import { BAND_LABEL, daysUntil, maturityBand, todayISO } from "./maturity";
import { sumAmounts } from "./money";

export type Filters = { from?: string; to?: string; institution?: string; status?: string };
export type Column = { key: string; label: string; kind?: "money" | "date" | "num" | "text" };
export type Report = {
  key: string;
  title: string;
  description: string;
  perm: Permission;
  columns: Column[];
  totalKey?: string;
  run: (u: SessionUser, f: Filters) => Promise<Record<string, unknown>[]>;
};

const okDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** Builds WHERE clauses with positional params; institution scope is always enforced for scoped roles. */
function where(u: SessionUser, f: Filters, cols: { inst: string; date?: string; status?: string }) {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); parts.push(sql.replace("?", `$${params.length}`)); };
  if (isScoped(u.role)) add(`${cols.inst} = ?`, u.institutionId);
  else if (f.institution && /^[0-9a-f-]{36}$/.test(f.institution)) add(`${cols.inst} = ?`, f.institution);
  if (cols.date && okDate(f.from)) add(`${cols.date} >= ?`, okDate(f.from));
  if (cols.date && okDate(f.to)) add(`${cols.date} <= ?`, okDate(f.to));
  if (cols.status && f.status && /^[a-z_]+$/.test(f.status)) add(`${cols.status} = ?`, f.status);
  return { sql: parts.length ? ` where ${parts.join(" and ")}` : "", params };
}

export const REPORTS: Report[] = [
  {
    key: "maturity_forecast", title: "FDR maturity forecast", perm: "report.read", totalKey: "principal",
    description: "Every FDR with its computed maturity band. Use the date range to forecast a window.",
    columns: [
      { key: "fdr_number", label: "FDR number" }, { key: "institution", label: "Institution" }, { key: "bank", label: "Bank" },
      { key: "principal", label: "Principal (INR)", kind: "money" }, { key: "maturity_date", label: "Maturity", kind: "date" },
      { key: "days", label: "Days left", kind: "num" }, { key: "band", label: "Band" }, { key: "verification_status", label: "Verification" },
    ],
    run: async (u, f) => {
      const w = where(u, f, { inst: "f.institution_id", date: "f.maturity_date", status: "f.lifecycle_status" });
      const rows = await q<Record<string, string>>(`select f.fdr_number, i.name as institution, f.bank, f.principal, f.maturity_date, f.lifecycle_status,
        f.verification_status from fdr_records f join institutions i on i.id=f.institution_id${w.sql} order by f.maturity_date`, w.params);
      const t = todayISO();
      return rows.map((r) => ({ ...r, days: daysUntil(r.maturity_date, t), band: BAND_LABEL[maturityBand(r.maturity_date, t, r.lifecycle_status)] }));
    },
  },
  {
    key: "deposit_register", title: "Deposit register", perm: "report.read", totalKey: "principal",
    description: "All security deposits with workflow, verification and release status.",
    columns: [
      { key: "code", label: "Deposit ID" }, { key: "institution", label: "Institution" }, { key: "deposit_type", label: "Type" },
      { key: "principal", label: "Principal (INR)", kind: "money" }, { key: "deposit_date", label: "Deposit date", kind: "date" },
      { key: "bank", label: "Bank" }, { key: "status", label: "Status" }, { key: "verification_status", label: "Verification" }, { key: "release_status", label: "Release" },
    ],
    run: async (u, f) => {
      const w = where(u, f, { inst: "d.institution_id", date: "d.deposit_date", status: "d.status" });
      return q(`select d.code, i.name as institution, d.deposit_type, d.principal, d.deposit_date, d.bank, d.status, d.verification_status, d.release_status
        from deposits d join institutions i on i.id=d.institution_id${w.sql} order by d.code`, w.params);
    },
  },
  {
    key: "institution_summary", title: "Institution-wise deposit summary", perm: "report.read", totalKey: "total_principal",
    description: "Counts and totals per institution.",
    columns: [
      { key: "code", label: "ID" }, { key: "name", label: "Institution" }, { key: "state", label: "State" },
      { key: "deposits", label: "Deposits", kind: "num" }, { key: "active_fdrs", label: "Active FDRs", kind: "num" },
      { key: "total_principal", label: "Recorded value (INR)", kind: "money" }, { key: "pending_docs", label: "Docs pending", kind: "num" },
    ],
    run: async (u, f) => {
      const w = where(u, f, { inst: "i.id" });
      return q(`select i.code, i.name, i.state,
        (select count(*)::int from deposits d where d.institution_id=i.id) as deposits,
        (select count(*)::int from fdr_records x where x.institution_id=i.id and x.lifecycle_status='active') as active_fdrs,
        coalesce((select sum(principal) from deposits d where d.institution_id=i.id and d.status <> 'released'),0)::numeric(16,2)::text as total_principal,
        (select count(*)::int from documents o where o.institution_id=i.id and o.status='pending_review') as pending_docs
        from institutions i${w.sql} order by i.name`, w.params);
    },
  },
  {
    key: "pending_verification", title: "Pending verification", perm: "report.read",
    description: "Documents waiting for a reviewer decision, oldest first.",
    columns: [
      { key: "code", label: "Document" }, { key: "title", label: "Title" }, { key: "institution", label: "Institution" },
      { key: "version", label: "Version", kind: "num" }, { key: "submitted", label: "Submitted", kind: "date" }, { key: "age_days", label: "Age (days)", kind: "num" },
    ],
    run: async (u, f) => {
      const w = where(u, f, { inst: "d.institution_id" });
      return q(`select d.code, d.title, i.name as institution, d.current_version as version, d.updated_at::date::text as submitted,
        floor(extract(epoch from now()-d.updated_at)/86400)::int as age_days
        from documents d join institutions i on i.id=d.institution_id${w.sql ? w.sql + " and" : " where"} d.status='pending_review' order by d.updated_at`, w.params);
    },
  },
  {
    key: "overdue_workflow", title: "Overdue workflow", perm: "report.read",
    description: "Release requests past their due date and FDRs matured without a next action.",
    columns: [
      { key: "kind", label: "Item" }, { key: "ref", label: "Reference" }, { key: "institution", label: "Institution" },
      { key: "due", label: "Due", kind: "date" }, { key: "days_overdue", label: "Days overdue", kind: "num" }, { key: "status", label: "Status" },
    ],
    run: async (u, f) => {
      const t = todayISO();
      const w1 = where(u, f, { inst: "r.institution_id" });
      const rel = await q<Record<string, unknown>>(`select 'Release request' as kind, r.code as ref, i.name as institution, r.due_date as due, r.status
        from release_requests r join institutions i on i.id=r.institution_id${w1.sql ? w1.sql + " and" : " where"} r.status in ('submitted','under_review','info_requested') and r.due_date < '${t}'`, w1.params);
      const w2 = where(u, f, { inst: "x.institution_id" });
      const fdr = await q<Record<string, unknown>>(`select 'Matured FDR' as kind, x.fdr_number as ref, i.name as institution, x.maturity_date as due, x.lifecycle_status as status
        from fdr_records x join institutions i on i.id=x.institution_id${w2.sql ? w2.sql + " and" : " where"} x.maturity_date < '${t}' and x.lifecycle_status in ('active','matured')
        and not exists (select 1 from release_requests rr where rr.fdr_id=x.id and rr.status <> 'rejected') and x.renewal_status in ('none','pending','rejected')`, w2.params);
      return [...rel, ...fdr].map((r) => ({ ...r, days_overdue: -daysUntil(String(r.due), t) })).sort((a, b) => b.days_overdue - a.days_overdue);
    },
  },
  {
    key: "release_status", title: "Release / refund status", perm: "report.read",
    description: "All release requests with decisions and recorded outcomes (simulated or manually confirmed).",
    columns: [
      { key: "code", label: "Request" }, { key: "deposit", label: "Deposit" }, { key: "institution", label: "Institution" }, { key: "status", label: "Status" },
      { key: "requested", label: "Requested", kind: "date" }, { key: "due_date", label: "Due", kind: "date" }, { key: "outcome_ref", label: "Outcome ref" }, { key: "outcome_mode", label: "Outcome mode" },
    ],
    run: async (u, f) => {
      const w = where(u, f, { inst: "r.institution_id", date: "r.created_at::date", status: "r.status" });
      return q(`select r.code, d.code as deposit, i.name as institution, r.status, r.created_at::date::text as requested, r.due_date, r.outcome_ref, r.outcome_mode
        from release_requests r join deposits d on d.id=r.deposit_id join institutions i on i.id=r.institution_id${w.sql} order by r.created_at desc`, w.params);
    },
  },
  {
    key: "audit_activity", title: "Audit activity", perm: "audit.read",
    description: "Append-only audit events. Available to Administrators and Auditors.",
    columns: [
      { key: "at", label: "Time" }, { key: "actor_name", label: "Actor" }, { key: "actor_role", label: "Role" }, { key: "action", label: "Action" },
      { key: "entity_type", label: "Entity" }, { key: "entity_label", label: "Record" },
    ],
    run: async (_u, f) => {
      const parts: string[] = [];
      const params: unknown[] = [];
      if (okDate(f.from)) { params.push(f.from); parts.push(`created_at::date >= $${params.length}`); }
      if (okDate(f.to)) { params.push(f.to); parts.push(`created_at::date <= $${params.length}`); }
      return q(`select to_char(created_at, 'YYYY-MM-DD HH24:MI') as at, actor_name, actor_role, action, entity_type, entity_label from audit_logs
        ${parts.length ? "where " + parts.join(" and ") : ""} order by created_at desc limit 2000`, params);
    },
  },
];

export function getReport(key: string): Report | undefined {
  return REPORTS.find((r) => r.key === key);
}

export function totalOf(rows: Record<string, unknown>[], key?: string): string | null {
  if (!key) return null;
  return sumAmounts(rows.map((r) => (r[key] as string | null) ?? "0"));
}
