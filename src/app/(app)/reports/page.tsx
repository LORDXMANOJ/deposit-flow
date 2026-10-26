import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { REPORTS, getReport, totalOf } from "@/lib/reports";
import { formatINR } from "@/lib/money";
import { fmtDate, titleCase } from "@/lib/format";
import { hrefWith, type SP } from "@/lib/list";
import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Reports & Analytics" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("report.read");
  const sp = await searchParams;
  const available = REPORTS.filter((r) => can(u.role, r.perm));
  const report = getReport(sp.r ?? "") && can(u.role, getReport(sp.r!)!.perm) ? getReport(sp.r!)! : available[0];
  const filters = { from: sp.from, to: sp.to, institution: sp.institution, status: sp.status };
  const rows = await report.run(u, filters);
  const total = totalOf(rows, report.totalKey);
  const institutions = isScoped(u.role) || report.key === "audit_activity" ? [] : await q<{ id: string; name: string }>("select id, name from institutions order by name");
  const exportHref = hrefWith(`/api/export/${report.key}`, {}, filters);
  const shown = rows.slice(0, 200);
  const cell = (kind: string | undefined, v: unknown) => {
    if (v === null || v === undefined || v === "") return <span className="text-ink-3">-</span>;
    if (kind === "money") return formatINR(String(v));
    if (kind === "date") return fmtDate(String(v));
    if (typeof v === "string" && /^[a-z]+(_[a-z]+)+$|^(active|matured|released|approved|pending|submitted|rejected|renewed|verified|draft)$/.test(v)) return titleCase(v);
    return String(v);
  };

  return (
    <div>
      <PageHeader title="Reports" description="Every report applies the same permissions and institution scope as the screens. Exports are logged in the audit trail."
        actions={<>
          <PrintButton />
          {can(u.role, "report.export") && <a href={exportHref} download data-no-prerender className="btn btn-primary"><Download size={14} /> Export CSV</a>}
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6 items-start">
        <nav aria-label="Reports" className="lg:sticky lg:top-20 print:hidden">
          <ul className="flex lg:flex-col gap-0.5 overflow-x-auto scroll-thin">
            {available.map((r) => (
              <li key={r.key}>
                <Link href={`/reports?r=${r.key}`} aria-current={r.key === report.key ? "page" : undefined}
                  className={`block px-3 py-2 rounded-md text-[0.84rem] whitespace-nowrap ${r.key === report.key ? "bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)] font-medium" : "text-ink-2 hover:bg-[var(--sunken)]"}`}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <section className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">{report.title}</h2>
              <p className="text-[0.84rem] text-ink-3 mt-0.5">{report.description}</p>
            </div>
            <dl className="flex gap-6 text-right">
              <div><dt className="text-[0.74rem] text-ink-3">Rows</dt><dd className="figure text-[1.35rem]">{rows.length}</dd></div>
              {total && <div><dt className="text-[0.74rem] text-ink-3">Total</dt><dd className="figure text-[1.35rem]">{formatINR(total, { decimals: false })}</dd></div>}
            </dl>
          </div>
          <div className="card">
            <div className="print:hidden">
              <FilterBar filters={[
                { type: "date", name: "from", label: "From" },
                { type: "date", name: "to", label: "to" },
                ...(institutions.length ? [{ type: "select" as const, name: "institution", label: "Institution", options: institutions.map((i) => ({ value: i.id, label: i.name })) }] : []),
              ]} />
            </div>
            {rows.length === 0 ? <EmptyState title="No rows for these filters" /> : (
              <div className="table-wrap"><table className="dtable">
                <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.kind === "money" || c.kind === "num" ? "r" : ""}>{c.label}</th>)}</tr></thead>
                <tbody>{shown.map((r, i) => (
                  <tr key={i}>{report.columns.map((c) => <td key={c.key} className={c.kind === "money" || c.kind === "num" ? "r" : c.key.includes("number") || c.key === "code" || c.key === "ref" ? "mono" : ""}>{cell(c.kind, r[c.key])}</td>)}</tr>
                ))}</tbody>
                {total && <tfoot><tr>{report.columns.map((c, i) => <td key={c.key} className={`font-semibold border-t border-[var(--line-strong)] ${c.kind === "money" ? "r" : ""}`}>{i === 0 ? "Total" : c.key === report.totalKey ? formatINR(total) : ""}</td>)}</tr></tfoot>}
              </table></div>
            )}
            {rows.length > shown.length && <p className="px-4 py-2.5 text-[0.76rem] text-ink-3 border-t border-[var(--line)]">Showing the first {shown.length} of {rows.length} rows. Export the CSV for all rows.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
