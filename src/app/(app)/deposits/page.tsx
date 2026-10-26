import Link from "next/link";
import { Plus, Download, Landmark } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { formatINR, formatINRCompact } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { DEPOSIT_TYPES } from "@/lib/validation";
import { hrefWith, orderBy, pageOf, type SP } from "@/lib/list";
import { PageHeader, StatusBadge, EmptyState, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { SortTh } from "@/components/sort-header";

export const metadata = { title: "Security Deposits" };

const STATUSES = ["draft", "submitted", "under_review", "verified", "action_required", "matured", "release_requested", "released", "rejected"];

export default async function DepositsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("deposit.read");
  const sp = await searchParams;
  const { page, pageSize, offset } = pageOf(sp);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (isScoped(u.role)) add("d.institution_id = ?", u.institutionId);
  if (sp.q) add("(lower(d.code) like ? or lower(i.name) like ? or lower(d.bank) like ? or lower(coalesce(f.fdr_number,'')) like ?)", `%${sp.q.toLowerCase()}%`);
  if (sp.status) add("d.status = ?", sp.status);
  if (sp.type) add("d.deposit_type = ?", sp.type);
  if (sp.verification) add("d.verification_status = ?", sp.verification);
  const W = where.length ? `where ${where.join(" and ")}` : "";
  const order = orderBy(sp, { code: "d.code", principal: "d.principal", date: "d.deposit_date", inst: "i.name", updated: "d.updated_at" }, "d.updated_at desc");
  const from = `from deposits d join institutions i on i.id=d.institution_id
    left join lateral (select fdr_number, maturity_date from fdr_records x where x.deposit_id=d.id order by x.created_at desc limit 1) f on true`;

  const [rows, [agg]] = await Promise.all([
    q<{ id: string; code: string; inst: string; inst_id: string; deposit_type: string; principal: string; deposit_date: string; bank: string; status: string; verification_status: string; fdr_number: string | null; maturity_date: string | null }>(
      `select d.id, d.code, i.name as inst, i.id as inst_id, d.deposit_type, d.principal, d.deposit_date, d.bank, d.status, d.verification_status, f.fdr_number, f.maturity_date
       ${from} ${W} order by ${order} limit ${pageSize} offset ${offset}`, params),
    q<{ total: number; value: string }>(`select count(*)::int as total, coalesce(sum(d.principal),0)::numeric(16,2)::text as value ${from} ${W}`, params),
  ]);
  const exportHref = hrefWith("/api/export/deposit_register", {}, { status: sp.status });

  return (
    <div>
      <PageHeader title="Security deposits" description={`${agg.total} deposits matching, ${formatINRCompact(agg.value)} recorded principal.`}
        actions={<>
          {can(u.role, "report.export") && <a href={exportHref} className="btn btn-secondary" data-no-prerender download><Download size={14} /> Export CSV</a>}
          {can(u.role, "deposit.write") && <Link href="/deposits/new" className="btn btn-primary"><Plus size={15} /> New deposit</Link>}
        </>} />
      <div className="card">
        <FilterBar filters={[
          { type: "search", name: "q", placeholder: "Search deposit ID, institution, bank or FDR number" },
          { type: "select", name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) })) },
          { type: "select", name: "verification", label: "Verification", options: ["not_submitted", "pending", "approved", "changes_requested", "rejected"].map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) })) },
          { type: "select", name: "type", label: "Type", options: DEPOSIT_TYPES.map((t) => ({ value: t, label: t })) },
        ]} />
        {rows.length === 0 ? <EmptyState icon={Landmark} title="No deposits match" body="Adjust the filters or create a new deposit." /> : (
          <div className="table-wrap"><table className="dtable">
            <thead><tr>
              <SortTh label="Deposit" field="code" base="/deposits" sp={sp} />
              <SortTh label="Institution" field="inst" base="/deposits" sp={sp} />
              <th>Type</th>
              <SortTh label="Principal" field="principal" base="/deposits" sp={sp} className="r" />
              <SortTh label="Deposited" field="date" base="/deposits" sp={sp} />
              <th>FDR</th>
              <th>Status</th>
              <th>Verification</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/deposits/${r.id}`} className="mono link">{r.code}</Link></td>
                <td className="max-w-[240px]"><Link href={`/institutions/${r.inst_id}`} className="truncate block text-ink-2 hover:text-ink">{r.inst}</Link><span className="text-[0.72rem] text-ink-3">{r.bank}</span></td>
                <td className="text-ink-2 whitespace-nowrap">{r.deposit_type}</td>
                <td className="r">{formatINR(r.principal)}</td>
                <td className="text-ink-2 whitespace-nowrap">{fmtDate(r.deposit_date)}</td>
                <td>{r.fdr_number ? <><span className="mono text-[0.78rem]">{r.fdr_number}</span><span className="block text-[0.72rem] text-ink-3">matures {fmtDate(r.maturity_date)}</span></> : <span className="text-ink-3 text-[0.8rem]">None linked</span>}</td>
                <td><StatusBadge status={r.status} /></td>
                <td><StatusBadge status={r.verification_status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination page={page} pageSize={pageSize} total={agg.total} hrefFor={(p) => hrefWith("/deposits", sp, { page: String(p) })} />
      </div>
    </div>
  );
}
