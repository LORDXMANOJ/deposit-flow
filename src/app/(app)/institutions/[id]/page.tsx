import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireUser, assertInstitutionAccess } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR, formatINRCompact, sumAmounts } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { maturityBand, todayISO } from "@/lib/maturity";
import { PageHeader, Panel, DL, StatusBadge, BandBadge, EmptyState, Timeline } from "@/components/ui";
import { InstitutionForm } from "@/components/institution-form";
import { ArchiveToggle } from "@/components/archive-toggle";
import { DeleteInstitution } from "@/components/delete-institution";
import type { InstitutionInput } from "@/lib/validation";

export default async function InstitutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("institution.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inst = await one<InstitutionInput & { id: string; code: string; is_demo: boolean; created_at: string; updated_at: string }>(
    "select * from institutions where id=$1", [id]);
  if (!inst) notFound();
  try { assertInstitutionAccess(u, inst.id); } catch { notFound(); }
  const today = todayISO();

  const [deps, fdrs, docs, history] = await Promise.all([
    q<{ id: string; code: string; deposit_type: string; principal: string; deposit_date: string; status: string; verification_status: string }>(
      "select id, code, deposit_type, principal, deposit_date, status, verification_status from deposits where institution_id=$1 order by deposit_date desc", [id]),
    q<{ id: string; fdr_number: string; principal: string; maturity_date: string; lifecycle_status: string }>(
      "select id, fdr_number, principal, maturity_date, lifecycle_status from fdr_records where institution_id=$1 order by maturity_date", [id]),
    q<{ id: string; code: string; title: string; status: string; updated_at: string; current_version: number }>(
      "select id, code, title, status, updated_at, current_version from documents where institution_id=$1 order by updated_at desc", [id]),
    q<{ id: number; actor_name: string; action: string; created_at: string; entity_label: string | null }>(
      `select id, actor_name, action, created_at, entity_label from audit_logs
       where (entity_type='institution' and entity_id=$1::text)
          or entity_id in (select id::text from deposits where institution_id=$1::uuid)
          or entity_id in (select id::text from documents where institution_id=$1::uuid)
       order by created_at desc limit 12`, [id]),
  ]);
  const active = deps.filter((d) => !["released", "rejected"].includes(d.status));
  const writable = can(u.role, "institution.write");
  const { id: _i, code: _c, is_demo: _d, created_at: _ca, updated_at: _ua, ...formInitial } = inst;
  void _i; void _c; void _d; void _ca; void _ua;

  return (
    <div>
      <PageHeader
        title={inst.name}
        description={<><span className="mono">{inst.code}</span>, {inst.category}, {inst.district}, {inst.state}{inst.is_demo && <span className="ml-2 badge badge-violet">Demo data</span>}</>}
        actions={<>
          <StatusBadge status={inst.status} label={inst.status === "inactive" ? "Archived" : undefined} />
          {writable && <><ArchiveToggle id={inst.id} name={inst.name} status={inst.status} />
            <DeleteInstitution id={inst.id} name={inst.name} linked={deps.length + fdrs.length} />
            <InstitutionForm mode="edit" id={inst.id} initial={{ ...formInitial, aicte_ref: formInitial.aicte_ref ?? "" }} /></>}
          {can(u.role, "deposit.write") && <Link href={`/deposits/new?institution=${inst.id}`} className="btn btn-primary"><Plus size={15} /> New deposit</Link>}
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)] border border-[var(--line)] rounded-md overflow-hidden mb-6">
        {[
          ["Active deposits", String(active.length)],
          ["Active value", formatINRCompact(sumAmounts(active.map((d) => d.principal)))],
          ["FDRs on register", String(fdrs.length)],
          ["Documents pending", String(docs.filter((d) => d.status === "pending_review").length)],
        ].map(([k, v]) => (
          <div key={k} className="bg-[var(--surface)] px-4 py-3.5"><p className="text-[0.76rem] text-ink-3">{k}</p><p className="figure text-[1.45rem] mt-1">{v}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 flex flex-col gap-5">
          <Panel title="Security deposits" description={`${deps.length} on record`}>
            {deps.length === 0 ? <EmptyState title="No deposits yet" body="Create a deposit to start tracking its FDR and documents." /> : (
              <div className="table-wrap"><table className="dtable">
                <thead><tr><th>Deposit</th><th>Type</th><th className="r">Principal</th><th>Deposited</th><th>Status</th><th>Verification</th></tr></thead>
                <tbody>{deps.map((d) => (
                  <tr key={d.id}>
                    <td><Link href={`/deposits/${d.id}`} className="mono link">{d.code}</Link></td>
                    <td className="text-ink-2">{d.deposit_type}</td>
                    <td className="r">{formatINR(d.principal, { decimals: false })}</td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDate(d.deposit_date)}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td><StatusBadge status={d.verification_status} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
          <Panel title="FDRs" description="Maturity band is computed from today's date">
            {fdrs.length === 0 ? <EmptyState title="No FDRs registered" /> : (
              <div className="table-wrap"><table className="dtable">
                <thead><tr><th>FDR number</th><th className="r">Principal</th><th>Matures</th><th>Band</th></tr></thead>
                <tbody>{fdrs.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/fdrs/${f.id}`} className="mono link">{f.fdr_number}</Link></td>
                    <td className="r">{formatINR(f.principal, { decimals: false })}</td>
                    <td className="text-ink-2">{fmtDate(f.maturity_date)}</td>
                    <td><BandBadge band={maturityBand(f.maturity_date, today, f.lifecycle_status)} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
        </div>
        <div className="xl:col-span-4 flex flex-col gap-5">
          <Panel title="Profile">
            <DL items={[
              ["AICTE-related identifier", inst.aicte_ref ? <span className="mono">{inst.aicte_ref}</span> : null],
              ["Authorized contact", inst.contact_name],
              ["Email", inst.contact_email],
              ["Phone", <span key="p" className="tabular">{inst.contact_phone}</span>],
              ["Created", fmtDateTime(inst.created_at)],
              ["Last updated", fmtDateTime(inst.updated_at)],
            ]} />
          </Panel>
          <Panel title="Documents">
            {docs.length === 0 ? <EmptyState title="No documents uploaded" /> : (
              <ul className="divide-y divide-[var(--line)]">{docs.slice(0, 6).map((d) => (
                <li key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-[0.84rem] truncate">{d.title}</p><p className="text-[0.72rem] text-ink-3">v{d.current_version}, {fmtDate(d.updated_at)}</p></div>
                  <StatusBadge status={d.status} />
                </li>
              ))}</ul>
            )}
          </Panel>
          <Panel title="History">
            <Timeline events={history.map((h) => ({ id: h.id, title: <span className="mono text-[0.8rem]">{h.action}</span>, meta: `${h.actor_name}, ${fmtDateTime(h.created_at)}`, note: h.entity_label }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
