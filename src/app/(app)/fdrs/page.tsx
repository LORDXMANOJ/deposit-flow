import Link from "next/link";
import { Download, FileStack } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { formatINR, formatINRCompact } from "@/lib/money";
import { fmtDate, fmtDateTime, relativeDays } from "@/lib/format";
import { addDaysISO, daysUntil, maturityBand, todayISO } from "@/lib/maturity";
import { hrefWith, orderBy, pageOf, type SP } from "@/lib/list";
import { PageHeader, StatusBadge, BandBadge, EmptyState, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { SortTh } from "@/components/sort-header";

export const metadata = { title: "FDR Register" };

export default async function FdrRegister({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("deposit.read");
  const sp = await searchParams;
  const today = todayISO();
  const { page, pageSize, offset } = pageOf(sp, 20);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (isScoped(u.role)) add("f.institution_id = ?", u.institutionId);
  if (sp.q) add("(lower(f.fdr_number) like ? or lower(f.code) like ? or lower(i.name) like ? or lower(f.bank) like ?)", `%${sp.q.toLowerCase()}%`);
  if (sp.lifecycle) add("f.lifecycle_status = ?", sp.lifecycle);
  if (sp.verification) add("f.verification_status = ?", sp.verification);
  // Window filter uses the computed date logic, not a stored label.
  if (sp.window === "overdue") add("f.maturity_date < ? and f.lifecycle_status in ('active','matured')", today);
  if (sp.window === "30") { add("f.maturity_date >= ?", today); add("f.maturity_date <= ? and f.lifecycle_status='active'", addDaysISO(today, 30)); }
  if (sp.window === "90") { add("f.maturity_date >= ?", today); add("f.maturity_date <= ? and f.lifecycle_status='active'", addDaysISO(today, 90)); }
  const W = where.length ? `where ${where.join(" and ")}` : "";
  const order = orderBy(sp, { number: "f.fdr_number", principal: "f.principal", maturity: "f.maturity_date", inst: "i.name" }, "f.maturity_date asc");

  const [rows, [agg]] = await Promise.all([
    q<{ id: string; fdr_number: string; inst: string; bank: string; principal: string; issue_date: string; maturity_date: string; lifecycle_status: string; verification_status: string; renewal_status: string; last_notified_at: string | null; previous_fdr_id: string | null }>(
      `select f.id, f.fdr_number, i.name as inst, f.bank, f.principal, f.issue_date, f.maturity_date, f.lifecycle_status, f.verification_status, f.renewal_status, f.last_notified_at, f.previous_fdr_id
       from fdr_records f join institutions i on i.id=f.institution_id ${W} order by ${order} limit ${pageSize} offset ${offset}`, params),
    q<{ total: number; value: string }>(`select count(*)::int as total, coalesce(sum(f.principal),0)::numeric(16,2)::text as value from fdr_records f join institutions i on i.id=f.institution_id ${W}`, params),
  ]);

  return (
    <div>
      <PageHeader title="FDR register" description={`${agg.total} fixed deposit receipts, ${formatINRCompact(agg.value)} principal. Bands are computed from today's date and each FDR's state.`}
        actions={can(u.role, "report.export") ? <a href="/api/export/maturity_forecast" className="btn btn-secondary" data-no-prerender download><Download size={14} /> Export forecast</a> : undefined} />
      <div className="card">
        <FilterBar filters={[
          { type: "search", name: "q", placeholder: "Search FDR number, institution or bank" },
          { type: "select", name: "window", label: "Maturity", options: [{ value: "overdue", label: "Past maturity" }, { value: "30", label: "Next 30 days" }, { value: "90", label: "Next 90 days" }] },
          { type: "select", name: "lifecycle", label: "Lifecycle", options: ["active", "matured", "renewed", "released", "closed"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
          { type: "select", name: "verification", label: "Document", options: ["not_submitted", "pending", "approved", "changes_requested", "rejected"].map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) })) },
        ]} />
        {rows.length === 0 ? <EmptyState icon={FileStack} title="No FDRs match" /> : (
          <div className="table-wrap"><table className="dtable">
            <thead><tr>
              <SortTh label="FDR number" field="number" base="/fdrs" sp={sp} />
              <SortTh label="Institution" field="inst" base="/fdrs" sp={sp} />
              <SortTh label="Principal" field="principal" base="/fdrs" sp={sp} className="r" />
              <SortTh label="Matures" field="maturity" base="/fdrs" sp={sp} />
              <th>Band</th><th>Document</th><th>Renewal</th><th>Last reminder</th>
            </tr></thead>
            <tbody>{rows.map((f) => {
              const days = daysUntil(f.maturity_date, today);
              return (
                <tr key={f.id}>
                  <td><Link href={`/fdrs/${f.id}`} className="mono link">{f.fdr_number}</Link>{f.previous_fdr_id && <span className="block text-[0.7rem] text-ink-3">renewal FDR</span>}</td>
                  <td className="max-w-[230px]"><span className="block truncate text-ink-2">{f.inst}</span><span className="text-[0.72rem] text-ink-3">{f.bank}</span></td>
                  <td className="r">{formatINR(f.principal, { decimals: false })}</td>
                  <td className="whitespace-nowrap">{fmtDate(f.maturity_date)}<span className={`block text-[0.72rem] ${days < 0 && ["active", "matured"].includes(f.lifecycle_status) ? "text-[var(--bad-ink)]" : "text-ink-3"}`}>{relativeDays(days)}</span></td>
                  <td><BandBadge band={maturityBand(f.maturity_date, today, f.lifecycle_status)} /></td>
                  <td><StatusBadge status={f.verification_status} /></td>
                  <td>{f.renewal_status === "none" ? <span className="text-ink-3 text-[0.8rem]">None</span> : <StatusBadge status={f.renewal_status} />}</td>
                  <td className="text-[0.78rem] text-ink-3 whitespace-nowrap">{f.last_notified_at ? fmtDateTime(f.last_notified_at) : "Not yet"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <Pagination page={page} pageSize={pageSize} total={agg.total} hrefFor={(p) => hrefWith("/fdrs", sp, { page: String(p) })} />
      </div>
    </div>
  );
}
