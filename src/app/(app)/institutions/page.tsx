import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { formatINRCompact } from "@/lib/money";
import { CATEGORIES } from "@/lib/validation";
import { hrefWith, orderBy, pageOf, type SP } from "@/lib/list";
import { PageHeader, StatusBadge, EmptyState, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { SortTh } from "@/components/sort-header";
import { InstitutionForm } from "@/components/institution-form";
import { ArchiveToggle } from "@/components/archive-toggle";

export const metadata = { title: "Institutions" };

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("institution.read");
  const sp = await searchParams;
  const { page, pageSize, offset } = pageOf(sp);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (isScoped(u.role)) add("i.id = ?", u.institutionId);
  if (sp.q) add("(lower(i.name) like ? or lower(i.code) like ? or lower(coalesce(i.aicte_ref,'')) like ? or lower(i.district) like ?)", `%${sp.q.toLowerCase()}%`);
  if (sp.category) add("i.category = ?", sp.category);
  if (sp.state) add("i.state = ?", sp.state);
  if (sp.status) add("i.status = ?", sp.status);
  const W = where.length ? `where ${where.join(" and ")}` : "";
  const order = orderBy(sp, { name: "i.name", state: "i.state", deposits: "deposits", value: "value_sort", updated: "i.updated_at" }, "i.name asc");

  const [rows, [{ total }], states] = await Promise.all([
    q<{ id: string; code: string; name: string; category: string; state: string; district: string; contact_name: string; status: string; deposits: number; value: string; pending: number }>(
      `select i.id, i.code, i.name, i.category, i.state, i.district, i.contact_name, i.status,
        (select count(*)::int from deposits d where d.institution_id=i.id) as deposits,
        (select coalesce(sum(d.principal),0) from deposits d where d.institution_id=i.id and d.status not in ('released','rejected')) as value_sort,
        (select coalesce(sum(d.principal),0)::numeric(16,2)::text from deposits d where d.institution_id=i.id and d.status not in ('released','rejected')) as value,
        (select count(*)::int from documents o where o.institution_id=i.id and o.status='pending_review') as pending
       from institutions i ${W} order by ${order} limit ${pageSize} offset ${offset}`, params),
    q<{ total: number }>(`select count(*)::int as total from institutions i ${W}`, params),
    q<{ state: string }>("select distinct state from institutions order by state"),
  ]);

  const writable = can(u.role, "institution.write");
  return (
    <div>
      <PageHeader title="Institutions" description="Institutions holding security deposits and FDRs. Archived institutions keep their full history." actions={writable ? <InstitutionForm mode="create" /> : undefined} />
      <div className="card">
        <FilterBar filters={[
          { type: "search", name: "q", placeholder: "Search name, ID, AICTE ref or district" },
          { type: "select", name: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          { type: "select", name: "state", label: "State", options: states.map((s) => ({ value: s.state, label: s.state })) },
          { type: "select", name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Archived" }, { value: "suspended", label: "Suspended" }] },
        ]} />
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="No institutions match" body="Try a different search or clear the filters." />
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr>
                <SortTh label="Institution" field="name" base="/institutions" sp={sp} />
                <th>Category</th>
                <SortTh label="Location" field="state" base="/institutions" sp={sp} />
                <th>Authorized contact</th>
                <SortTh label="Deposits" field="deposits" base="/institutions" sp={sp} className="r" />
                <SortTh label="Active value" field="value" base="/institutions" sp={sp} className="r" />
                <th>Status</th>
                {writable && <th className="w-10"><span className="sr-only">Actions</span></th>}
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[340px]">
                      <Link href={`/institutions/${r.id}`} className="font-medium hover:underline underline-offset-2 block truncate">{r.name}</Link>
                      <span className="mono text-[0.74rem] text-ink-3">{r.code}</span>
                    </td>
                    <td className="text-ink-2">{r.category}</td>
                    <td className="text-ink-2 whitespace-nowrap">{r.district}<span className="block text-[0.74rem] text-ink-3">{r.state}</span></td>
                    <td className="text-ink-2">{r.contact_name}</td>
                    <td className="r">{r.deposits}{r.pending > 0 && <span className="block text-[0.7rem] text-[var(--warn-ink)] font-sans">{r.pending} to verify</span>}</td>
                    <td className="r">{formatINRCompact(r.value)}</td>
                    <td><StatusBadge status={r.status} label={r.status === "inactive" ? "Archived" : undefined} /></td>
                    {writable && <td><ArchiveToggle id={r.id} name={r.name} status={r.status} compact /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => hrefWith("/institutions", sp, { page: String(p) })} />
      </div>
    </div>
  );
}
