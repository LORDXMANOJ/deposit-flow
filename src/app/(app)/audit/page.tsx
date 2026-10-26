import { ScrollText, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { hrefWith, pageOf, type SP } from "@/lib/list";
import { PageHeader, EmptyState, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Audit Trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser("audit.read");
  const sp = await searchParams;
  const { page, pageSize, offset } = pageOf(sp, 30);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (sp.q) add("(lower(actor_name) like ? or lower(action) like ? or lower(coalesce(entity_label,'')) like ?)", `%${sp.q.toLowerCase()}%`);
  if (sp.entity) add("entity_type = ?", sp.entity);
  if (sp.role) add("actor_role = ?", sp.role);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) add("created_at::date >= ?", sp.from);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) add("created_at::date <= ?", sp.to);
  const W = where.length ? `where ${where.join(" and ")}` : "";
  const [rows, [{ total }], entities] = await Promise.all([
    q<{ id: number; actor_name: string; actor_role: string | null; action: string; entity_type: string; entity_id: string | null; entity_label: string | null; meta: Record<string, unknown>; created_at: string }>(
      `select id, actor_name, actor_role, action, entity_type, entity_id, entity_label, meta, created_at from audit_logs ${W} order by created_at desc, id desc limit ${pageSize} offset ${offset}`, params),
    q<{ total: number }>(`select count(*)::int as total from audit_logs ${W}`, params),
    q<{ entity_type: string }>("select distinct entity_type from audit_logs order by 1"),
  ]);

  return (
    <div>
      <PageHeader title="Audit trail" description={`${total} events. Append-only: a database trigger rejects any update or delete, including from the application itself.`}
        actions={<a href={hrefWith("/api/export/audit_activity", {}, { from: sp.from, to: sp.to })} download data-no-prerender className="btn btn-secondary">Export CSV</a>} />
      <div className="card">
        <FilterBar filters={[
          { type: "search", name: "q", placeholder: "Search actor, action or record" },
          { type: "select", name: "entity", label: "Entity", options: entities.map((e) => ({ value: e.entity_type, label: e.entity_type.replace("_", " ") })) },
          { type: "select", name: "role", label: "Role", options: ["admin", "institution", "verifier", "finance", "auditor", "system"].map((r) => ({ value: r, label: r })) },
          { type: "date", name: "from", label: "From" },
          { type: "date", name: "to", label: "to" },
        ]} />
        {rows.length === 0 ? <EmptyState icon={ScrollText} title="No events match" /> : (
          <div className="table-wrap"><table className="dtable">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Change details</th></tr></thead>
            <tbody>{rows.map((r) => {
              const meta = Object.entries(r.meta ?? {});
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap text-ink-2 tabular">{fmtDateTime(r.created_at)}<span className="block mono text-[0.68rem] text-ink-3">#{r.id}</span></td>
                  <td><span className="block">{r.actor_name}</span><span className="text-[0.72rem] text-ink-3">{r.actor_role ?? "-"}</span></td>
                  <td><span className="mono text-[0.78rem]">{r.action}</span></td>
                  <td className="max-w-[260px]"><span className="block truncate">{r.entity_label ?? "-"}</span><span className="text-[0.72rem] text-ink-3">{r.entity_type}</span></td>
                  <td className="max-w-[360px]">
                    {meta.length === 0 ? <span className="text-ink-3">-</span> : (
                      <details>
                        <summary className="text-[0.78rem] text-ink-2 hover:text-ink">{meta.length} field{meta.length === 1 ? "" : "s"}</summary>
                        <pre className="mt-1.5 text-[0.72rem] mono whitespace-pre-wrap break-words bg-[var(--surface-2)] border border-[var(--line)] rounded p-2">{JSON.stringify(r.meta, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => hrefWith("/audit", sp, { page: String(p) })} />
      </div>
      <p className="mt-4 flex items-center gap-2 text-[0.78rem] text-ink-3"><Lock size={13} /> Passwords, tokens and document contents are never written to audit metadata.</p>
    </div>
  );
}
