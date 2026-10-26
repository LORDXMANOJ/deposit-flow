import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History } from "lucide-react";
import { requireUser, assertInstitutionAccess } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime, relativeDays, titleCase } from "@/lib/format";
import { BAND_LABEL, daysUntil, dueThreshold, maturityBand, todayISO } from "@/lib/maturity";
import { getSetting } from "@/lib/alert-engine";
import { signFileToken } from "@/lib/storage";
import { PageHeader, Panel, DL, StatusBadge, BandBadge, EmptyState, Timeline } from "@/components/ui";
import { UploadDocument } from "@/components/upload-document";
import { RenewalForm } from "@/components/renewal-form";
import { NotesEditor } from "@/components/notes-editor";

function nextAction(band: string, verification: string, renewal: string, hasDoc: boolean): string {
  if (!hasDoc) return "Upload the bank-issued FDR receipt.";
  if (verification === "pending") return "Waiting for a verification officer to review the receipt.";
  if (verification === "changes_requested" || verification === "rejected") return "Upload a corrected receipt.";
  if (band === "closed") return "No action. This FDR is closed.";
  if (renewal !== "none" && renewal !== "rejected") return `Renewal ${renewal.replace("_", " ")}. Track the new FDR.`;
  if (band === "overdue") return "Matured. Record a renewal or request release.";
  if (band === "due_today" || band === "within_7") return "Decide renewal or release this week.";
  return "No action needed yet. Reminders run at the configured thresholds.";
}

export default async function FdrDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("deposit.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const f = await one<{ id: string; code: string; fdr_number: string; deposit_id: string; dep_code: string; institution_id: string; inst: string; bank: string; principal: string; issue_date: string;
    maturity_date: string; renewal_status: string; verification_status: string; lifecycle_status: string; previous_fdr_id: string | null; prev_no: string | null; last_notified_at: string | null;
    remarks: string | null; is_demo: boolean; created_at: string }>(
    `select f.*, d.code as dep_code, i.name as inst, p.fdr_number as prev_no from fdr_records f join deposits d on d.id=f.deposit_id
     join institutions i on i.id=f.institution_id left join fdr_records p on p.id=f.previous_fdr_id where f.id=$1`, [id]);
  if (!f) notFound();
  try { assertInstitutionAccess(u, f.institution_id); } catch { notFound(); }
  const today = todayISO();
  const thresholds = await getSetting<number[]>("reminder_thresholds", [30, 15, 7, 0]);
  const maxMb = await getSetting<number>("max_file_mb", 5);

  const [versions, reviews, events, alerts, next] = await Promise.all([
    q<{ id: string; document_id: string; doc_code: string; version: number; original_name: string; mime: string; size_bytes: number; uploaded_at: string; uploader: string | null;
      declared_fdr_number: string | null; declared_amount: string | null; declared_maturity: string | null; doc_status: string; current_version: number }>(
      `select v.id, v.document_id, d.code as doc_code, v.version, v.original_name, v.mime, v.size_bytes, v.uploaded_at, p.full_name as uploader,
              v.declared_fdr_number, v.declared_amount, v.declared_maturity, d.status as doc_status, d.current_version
       from document_versions v join documents d on d.id=v.document_id left join profiles p on p.id=v.uploaded_by
       where d.fdr_id=$1 order by v.version desc`, [id]),
    q<{ id: string; version: number; decision: string; remarks: string | null; reviewed_at: string; reviewer: string | null; mode: string }>(
      `select r.id, r.version, r.decision, r.remarks, r.reviewed_at, p.full_name as reviewer, r.mode from verification_reviews r
       join documents d on d.id=r.document_id left join profiles p on p.id=r.reviewer_id where d.fdr_id=$1 order by r.reviewed_at desc`, [id]),
    q<{ id: number; from_status: string | null; to_status: string; actor_name: string | null; note: string | null; created_at: string }>(
      "select id, from_status, to_status, actor_name, note, created_at from workflow_events where entity_type='fdr' and entity_id=$1 order by created_at desc", [id]),
    q<{ id: string; code: string; title: string; severity: string; status: string; threshold: number; created_at: string }>(
      "select id, code, title, severity, status, threshold, created_at from alerts where entity_id=$1 order by created_at desc", [id]),
    q<{ id: string; fdr_number: string }>("select id, fdr_number from fdr_records where previous_fdr_id=$1", [id]),
  ]);

  const band = maturityBand(f.maturity_date, today, f.lifecycle_status);
  const days = daysUntil(f.maturity_date, today);
  const due = dueThreshold(f.maturity_date, today, f.lifecycle_status, thresholds);
  const canRenew = can(u.role, "renewal.manage") && ["active", "matured"].includes(f.lifecycle_status) && !["initiated", "verified"].includes(f.renewal_status) && next.length === 0;
  const latest = versions[0];

  return (
    <div>
      <PageHeader
        title={f.fdr_number}
        description={<><Link href={`/institutions/${f.institution_id}`} className="link">{f.inst}</Link>, deposit <Link href={`/deposits/${f.deposit_id}`} className="link mono">{f.dep_code}</Link>{f.is_demo && <span className="ml-2 badge badge-violet">Fictional FDR</span>}</>}
        actions={<>
          {canRenew && <RenewalForm fdrId={f.id} fdrNumber={f.fdr_number} principal={f.principal} maturity={f.maturity_date} />}
          {can(u.role, "document.upload") && f.lifecycle_status !== "released" && <UploadDocument fdrId={f.id} hasExisting={versions.length > 0} maxMb={maxMb} />}
        </>}
      />

      {/* Maturity hero: the one number that matters on this page */}
      <section className="card mb-6 grid md:grid-cols-[1.2fr_1fr_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-[var(--line)]">
        <div className="p-5">
          <p className="text-[0.76rem] text-ink-3">Matures</p>
          <p className="figure text-[2rem] leading-tight mt-1">{fmtDate(f.maturity_date)}</p>
          <p className={`text-[0.84rem] mt-1 ${days < 0 && band !== "closed" ? "text-[var(--bad-ink)]" : "text-ink-2"}`}>{relativeDays(days)}</p>
        </div>
        <div className="p-5"><p className="text-[0.76rem] text-ink-3">Principal</p><p className="figure text-[1.35rem] mt-1">{formatINR(f.principal)}</p><p className="text-[0.76rem] text-ink-3 mt-1">{f.bank}</p></div>
        <div className="p-5"><p className="text-[0.76rem] text-ink-3">Computed band</p><div className="mt-2"><BandBadge band={band} /></div>
          <p className="text-[0.76rem] text-ink-3 mt-2">{due === null ? "No reminder threshold reached" : due < 0 ? "After maturity, action pending" : due === 0 ? "On-maturity reminder" : `${due}-day reminder threshold`}</p></div>
        <div className="p-5"><p className="text-[0.76rem] text-ink-3">Next action</p><p className="text-[0.86rem] mt-1.5 text-ink">{nextAction(band, f.verification_status, f.renewal_status, versions.length > 0)}</p></div>
      </section>

      {(f.previous_fdr_id || next.length > 0) && (
        <div className="mb-5 flex items-center gap-2 text-[0.84rem] text-ink-2 border-l-2 border-[var(--accent)] pl-3">
          <History size={15} className="text-ink-3" />
          {f.previous_fdr_id && <span>Renewal of <Link href={`/fdrs/${f.previous_fdr_id}`} className="link mono">{f.prev_no}</Link>.</span>}
          {next.map((n) => <span key={n.id}>Renewed by <Link href={`/fdrs/${n.id}`} className="link mono">{n.fdr_number}</Link>.</span>)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 flex flex-col gap-5">
          <Panel title="FDR receipt" description={latest ? `Version ${latest.current_version}, ${titleCase(latest.doc_status)}` : "Not uploaded"} actions={latest ? <StatusBadge status={latest.doc_status} /> : undefined}>
            {versions.length === 0 ? <EmptyState title="No receipt uploaded" body="Upload the bank-issued FDR receipt so a verification officer can review it." /> : (
              <div className="table-wrap"><table className="dtable">
                <thead><tr><th>Version</th><th>File</th><th>Uploaded</th><th>Values on document (unverified)</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>{versions.map((v) => {
                  const mism = (v.declared_fdr_number && v.declared_fdr_number !== f.fdr_number) || (v.declared_amount && v.declared_amount !== f.principal) || (v.declared_maturity && v.declared_maturity !== f.maturity_date);
                  return (
                    <tr key={v.id}>
                      <td className="n">v{v.version}{v.version === v.current_version && <span className="block text-[0.7rem] text-ink-3 font-sans">current</span>}</td>
                      <td className="max-w-[200px]"><span className="block truncate">{v.original_name}</span><span className="text-[0.72rem] text-ink-3">{v.mime.split("/")[1].toUpperCase()}, {Math.ceil(v.size_bytes / 1024)} KB</span></td>
                      <td className="whitespace-nowrap text-ink-2">{fmtDateTime(v.uploaded_at)}<span className="block text-[0.72rem] text-ink-3">{v.uploader ?? "Unknown"}</span></td>
                      <td className="text-[0.78rem]">
                        {v.declared_amount || v.declared_maturity || v.declared_fdr_number ? (
                          <span className={mism ? "text-[var(--bad-ink)]" : "text-ink-2"}>
                            {v.declared_amount ? formatINR(v.declared_amount, { decimals: false }) : "-"}, {fmtDate(v.declared_maturity)}{mism ? " (differs from register)" : ""}
                          </span>
                        ) : <span className="text-ink-3">Not provided</span>}
                      </td>
                      <td><a className="btn btn-ghost btn-sm" data-no-prerender target="_blank" rel="noopener" href={`/api/files/${v.id}?token=${signFileToken(v.id, u.id)}`}>View <ExternalLink size={12} /></a></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Panel>
          <Panel title="Review decisions">
            {reviews.length === 0 ? <EmptyState title="Not reviewed yet" /> : (
              <Timeline events={reviews.map((r) => ({ id: r.id, title: <span className="flex items-center gap-2">{titleCase(r.decision)} <span className="text-ink-3 font-normal">on v{r.version}</span></span>,
                meta: `${r.reviewer ?? "Reviewer"}, ${fmtDateTime(r.reviewed_at)}, ${r.mode === "manual" ? "manual review" : "simulated"}`, note: r.remarks }))} />
            )}
          </Panel>
        </div>
        <div className="xl:col-span-4 flex flex-col gap-5">
          <Panel title="Record">
            <DL items={[
              ["Register ID", <span key="c" className="mono">{f.code}</span>],
              ["Issued", fmtDate(f.issue_date)],
              ["Lifecycle", titleCase(f.lifecycle_status)],
              ["Renewal", titleCase(f.renewal_status)],
              ["Last reminder", f.last_notified_at ? fmtDateTime(f.last_notified_at) : "Not yet"],
              ["Reminder thresholds", `${thresholds.join(", ")} days`],
              ["Source verification", (
                <div key="sv" className="flex flex-col gap-1 items-start">
                  {f.verification_status === "verified" || latest?.doc_status === "approved" ? (
                    <span className="badge badge-ok font-medium">Bank Confirmed / Lien Marked</span>
                  ) : (
                    <span className="badge badge-warn font-medium">Institution Submitted</span>
                  )}
                  <span className="text-[0.7rem] text-ink-3">
                    {f.verification_status === "verified" || latest?.doc_status === "approved"
                      ? "Independent bank confirmation or official scrutiny verified."
                      : "Awaiting primary source bank confirmation or API reconciliation."}
                  </span>
                </div>
              )],
            ]} />
          </Panel>
          <Panel title="Alerts for this FDR">
            {alerts.length === 0 ? <p className="p-4 text-[0.82rem] text-ink-3">None raised. Current band: {BAND_LABEL[band]}.</p> : (
              <ul className="divide-y divide-[var(--line)]">{alerts.map((a) => (
                <li key={a.id} className="px-4 py-2.5"><div className="flex justify-between gap-2"><Link href={`/alerts?focus=${a.id}`} className="text-[0.82rem] font-medium hover:underline underline-offset-2">{a.title}</Link><StatusBadge status={a.status} /></div>
                  <p className="text-[0.72rem] text-ink-3"><span className="mono">{a.code}</span>, {fmtDateTime(a.created_at)}</p></li>
              ))}</ul>
            )}
          </Panel>
          <Panel title="Internal remarks"><NotesEditor id={f.id} initial={f.remarks ?? ""} kind="fdr" editable={can(u.role, "fdr.write")} /></Panel>
          <Panel title="Lifecycle history">
            <Timeline events={events.map((e) => ({ id: e.id, title: e.from_status ? <>{titleCase(e.from_status)} <span className="text-ink-3">to</span> {titleCase(e.to_status)}</> : titleCase(e.to_status),
              meta: `${e.actor_name ?? "System"}, ${fmtDateTime(e.created_at)}`, note: e.note }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
