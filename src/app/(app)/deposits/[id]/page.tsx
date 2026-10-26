import Link from "next/link";
import { notFound } from "next/navigation";
import { FileStack } from "lucide-react";
import { requireUser, assertInstitutionAccess } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { daysUntil, maturityBand, todayISO } from "@/lib/maturity";
import { PageHeader, Panel, DL, StatusBadge, BandBadge, EmptyState, Timeline } from "@/components/ui";
import { ReleaseRequestButton } from "@/components/release-request";
import { NotesEditor } from "@/components/notes-editor";
import { relativeDays } from "@/lib/format";

export default async function DepositDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("deposit.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await one<{ id: string; code: string; institution_id: string; inst: string; deposit_type: string; principal: string; deposit_date: string; bank: string;
    status: string; verification_status: string; renewal_status: string; release_status: string; notes: string | null; is_demo: boolean; created_at: string; updated_at: string }>(
    "select d.*, i.name as inst from deposits d join institutions i on i.id=d.institution_id where d.id=$1", [id]);
  if (!d) notFound();
  try { assertInstitutionAccess(u, d.institution_id); } catch { notFound(); }
  const today = todayISO();

  const [fdrs, docs, events, releases] = await Promise.all([
    q<{ id: string; code: string; fdr_number: string; principal: string; issue_date: string; maturity_date: string; lifecycle_status: string; verification_status: string; renewal_status: string; previous_fdr_id: string | null }>(
      "select id, code, fdr_number, principal, issue_date, maturity_date, lifecycle_status, verification_status, renewal_status, previous_fdr_id from fdr_records where deposit_id=$1 order by created_at", [id]),
    q<{ id: string; code: string; title: string; status: string; current_version: number; updated_at: string }>(
      "select id, code, title, status, current_version, updated_at from documents where deposit_id=$1 order by updated_at desc", [id]),
    q<{ id: number; from_status: string | null; to_status: string; actor_name: string | null; note: string | null; created_at: string }>(
      "select id, from_status, to_status, actor_name, note, created_at from workflow_events where entity_type='deposit' and entity_id=$1 order by created_at desc", [id]),
    q<{ id: string; code: string; status: string; created_at: string; outcome_ref: string | null; outcome_mode: string | null }>(
      "select id, code, status, created_at, outcome_ref, outcome_mode from release_requests where deposit_id=$1 order by created_at desc", [id]),
  ]);
  const canRelease = can(u.role, "release.create") && d.verification_status === "approved" && !["release_requested", "released"].includes(d.status);

  return (
    <div>
      <PageHeader
        title={d.code}
        description={<><Link href={`/institutions/${d.institution_id}`} className="link">{d.inst}</Link>, {d.deposit_type}{d.is_demo && <span className="ml-2 badge badge-violet">Demo data</span>}</>}
        actions={<>
          <StatusBadge status={d.status} />
          {canRelease && <ReleaseRequestButton depositId={d.id} />}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--line)] border border-[var(--line)] rounded-md overflow-hidden mb-6">
        {[["Principal", formatINR(d.principal)], ["Deposited", fmtDate(d.deposit_date)], ["Verification", <StatusBadge key="v" status={d.verification_status} />], ["Release", <StatusBadge key="r" status={d.release_status} />]].map(([k, v]) => (
          <div key={String(k)} className="bg-[var(--surface)] px-4 py-3.5"><p className="text-[0.76rem] text-ink-3">{k}</p><div className="figure text-[1.3rem] mt-1">{v}</div></div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 flex flex-col gap-5">
          <Panel title="Linked FDRs" description="A renewal adds a new FDR; earlier FDRs and their history are kept">
            {fdrs.length === 0 ? <EmptyState icon={FileStack} title="No FDR linked" body="This deposit has no fixed deposit receipt registered." /> : (
              <div className="table-wrap"><table className="dtable">
                <thead><tr><th>FDR number</th><th className="r">Principal</th><th>Issued</th><th>Matures</th><th>Band</th><th>Document</th></tr></thead>
                <tbody>{fdrs.map((f) => {
                  const days = daysUntil(f.maturity_date, today);
                  return (
                    <tr key={f.id}>
                      <td><Link href={`/fdrs/${f.id}`} className="mono link">{f.fdr_number}</Link>{f.previous_fdr_id && <span className="block text-[0.7rem] text-ink-3">renewal</span>}</td>
                      <td className="r">{formatINR(f.principal, { decimals: false })}</td>
                      <td className="text-ink-2 whitespace-nowrap">{fmtDate(f.issue_date)}</td>
                      <td className="whitespace-nowrap">{fmtDate(f.maturity_date)}<span className="block text-[0.72rem] text-ink-3">{relativeDays(days)}</span></td>
                      <td><BandBadge band={maturityBand(f.maturity_date, today, f.lifecycle_status)} /></td>
                      <td><StatusBadge status={f.verification_status} /></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Panel>
          <Panel title="Documents">
            {docs.length === 0 ? <EmptyState title="No documents" body="Open the FDR to upload its receipt." /> : (
              <ul className="divide-y divide-[var(--line)]">{docs.map((x) => (
                <li key={x.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0"><Link href={`/verification?doc=${x.id}`} className="text-[0.86rem] font-medium hover:underline underline-offset-2">{x.title}</Link>
                    <p className="text-[0.72rem] text-ink-3"><span className="mono">{x.code}</span>, version {x.current_version}, updated {fmtDateTime(x.updated_at)}</p></div>
                  <StatusBadge status={x.status} />
                </li>
              ))}</ul>
            )}
          </Panel>
          {releases.length > 0 && (
            <Panel title="Release requests">
              <ul className="divide-y divide-[var(--line)]">{releases.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div><Link href={`/releases?open=${r.id}`} className="mono link">{r.code}</Link>
                    <p className="text-[0.72rem] text-ink-3">Requested {fmtDate(r.created_at)}{r.outcome_ref ? `, outcome ${r.outcome_ref}` : ""}</p></div>
                  <div className="flex gap-1.5">{r.outcome_mode && <StatusBadge status={r.outcome_mode} />}<StatusBadge status={r.status} /></div>
                </li>
              ))}</ul>
            </Panel>
          )}
        </div>
        <div className="xl:col-span-4 flex flex-col gap-5">
          <Panel title="Details">
            <DL items={[
              ["Issuing bank", d.bank],
              ["Renewal status", titleCase(d.renewal_status)],
              ["Created", fmtDateTime(d.created_at)],
              ["Last updated", fmtDateTime(d.updated_at)],
            ]} />
          </Panel>
          <Panel title="Internal notes">
            <NotesEditor id={d.id} initial={d.notes ?? ""} kind="deposit" editable={can(u.role, "deposit.write")} />
          </Panel>
          <Panel title="Status history">
            <Timeline events={events.map((e) => ({
              id: e.id,
              title: e.from_status ? <>{titleCase(e.from_status)} <span className="text-ink-3">to</span> {titleCase(e.to_status)}</> : titleCase(e.to_status),
              meta: `${e.actor_name ?? "System"}, ${fmtDateTime(e.created_at)}`,
              note: e.note,
            }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
