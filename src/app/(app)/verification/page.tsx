import Link from "next/link";
import { FileSearch, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { signFileToken } from "@/lib/storage";
import { PageHeader, Panel, StatusBadge, EmptyState, Timeline } from "@/components/ui";
import { ReviewForm } from "@/components/review-form";

export const metadata = { title: "Document Verification" };

const TABS = [["pending_review", "Pending"], ["changes_requested", "Changes requested"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]] as const;

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ status?: string; doc?: string }> }) {
  const u = await requireUser("document.read");
  const sp = await searchParams;
  const status = TABS.some(([k]) => k === sp.status) ? sp.status! : "pending_review";
  const params: unknown[] = [];
  const where: string[] = [];
  if (status !== "all") { params.push(status); where.push(`d.status = $${params.length}`); }
  if (isScoped(u.role)) { params.push(u.institutionId); where.push(`d.institution_id = $${params.length}`); }
  const W = where.length ? `where ${where.join(" and ")}` : "";

  const [queue, counts] = await Promise.all([
    q<{ id: string; code: string; title: string; inst: string; status: string; current_version: number; updated_at: string; age: number }>(
      `select d.id, d.code, d.title, i.name as inst, d.status, d.current_version, d.updated_at, floor(extract(epoch from now()-d.updated_at)/86400)::int as age
       from documents d join institutions i on i.id=d.institution_id ${W} order by d.updated_at ${status === "pending_review" ? "asc" : "desc"} limit 60`, params),
    q<{ status: string; n: number }>(`select status, count(*)::int as n from documents d ${isScoped(u.role) ? "where d.institution_id=$1" : ""} group by status`, isScoped(u.role) ? [u.institutionId] : []),
  ]);
  const count = (s: string) => s === "all" ? counts.reduce((a, c) => a + c.n, 0) : counts.find((c) => c.status === s)?.n ?? 0;
  const selectedId = sp.doc && /^[0-9a-f-]{36}$/.test(sp.doc) ? sp.doc : queue[0]?.id;

  const doc = selectedId ? await one<{ id: string; code: string; title: string; status: string; current_version: number; institution_id: string; inst: string; fdr_id: string | null;
    fdr_number: string | null; principal: string | null; maturity_date: string | null; bank: string | null }>(
    `select d.id, d.code, d.title, d.status, d.current_version, d.institution_id, i.name as inst, d.fdr_id, f.fdr_number, f.principal, f.maturity_date, f.bank
     from documents d join institutions i on i.id=d.institution_id left join fdr_records f on f.id=d.fdr_id where d.id=$1`, [selectedId]) : null;
  const visible = doc && (!isScoped(u.role) || doc.institution_id === u.institutionId) ? doc : null;
  const [versions, reviews] = visible ? await Promise.all([
    q<{ id: string; version: number; original_name: string; mime: string; size_bytes: number; uploaded_at: string; uploader: string | null; sha256: string;
      declared_fdr_number: string | null; declared_amount: string | null; declared_maturity: string | null }>(
      `select v.id, v.version, v.original_name, v.mime, v.size_bytes, v.uploaded_at, p.full_name as uploader, v.sha256, v.declared_fdr_number, v.declared_amount, v.declared_maturity
       from document_versions v left join profiles p on p.id=v.uploaded_by where v.document_id=$1 order by v.version desc`, [visible.id]),
    q<{ id: string; version: number; decision: string; remarks: string | null; reviewed_at: string; reviewer: string | null; mode: string }>(
      `select r.id, r.version, r.decision, r.remarks, r.reviewed_at, p.full_name as reviewer, r.mode from verification_reviews r left join profiles p on p.id=r.reviewer_id
       where r.document_id=$1 order by r.reviewed_at desc`, [visible.id]),
  ]) : [[], []];
  const cur = versions[0];
  const fileUrl = cur ? `/api/files/${cur.id}?token=${signFileToken(cur.id, u.id, 600)}` : null;
  const tabHref = (s: string) => `/verification?status=${s}`;
  const rowsCmp: Array<[string, string | null, string | null, (v: string | null) => string]> = visible && cur ? [
    ["FDR number", visible.fdr_number, cur.declared_fdr_number, (v) => v ?? "Not provided"],
    ["Amount", visible.principal, cur.declared_amount, (v) => (v ? formatINR(v) : "Not provided")],
    ["Maturity", visible.maturity_date, cur.declared_maturity, (v) => (v ? fmtDate(v) : "Not provided")],
  ] : [];

  return (
    <div>
      <PageHeader title="Document verification" description="Review uploaded FDR receipts. Uploading never counts as verification; every decision is a recorded manual review." />

      <nav className="flex gap-1 mb-4 overflow-x-auto scroll-thin" aria-label="Queue filter">
        {TABS.map(([k, label]) => (
          <Link key={k} href={tabHref(k)} aria-current={status === k ? "page" : undefined}
            className={`px-3 h-8 inline-flex items-center gap-2 rounded-md text-[0.82rem] whitespace-nowrap ${status === k ? "bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)] font-medium text-ink" : "text-ink-3 hover:text-ink hover:bg-[var(--sunken)]"}`}>
            {label}<span className="mono text-[0.72rem] text-ink-3">{count(k)}</span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-5 items-start">
        <section className="card lg:sticky lg:top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto scroll-thin" aria-label="Queue">
          {queue.length === 0 ? <EmptyState icon={FileSearch} title="Nothing here" body={status === "pending_review" ? "The verification queue is clear." : "No documents in this state."} /> : (
            <ul className="divide-y divide-[var(--line)]">{queue.map((d) => {
              const active = d.id === visible?.id;
              return (
                <li key={d.id}>
                  <Link href={`/verification?status=${status}&doc=${d.id}`} scroll={false} aria-current={active ? "true" : undefined}
                    className={`block px-4 py-3 transition-colors ${active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[0.84rem] font-medium leading-snug">{d.title}</span>
                      {d.status === "pending_review" && d.age >= 3 && <span className="badge badge-bad shrink-0">{d.age}d</span>}
                    </div>
                    <p className="text-[0.74rem] text-ink-3 truncate mt-0.5">{d.inst}</p>
                    <p className="text-[0.72rem] text-ink-3 mt-1"><span className="mono">{d.code}</span>, v{d.current_version}, {fmtDate(d.updated_at)}</p>
                  </Link>
                </li>
              );
            })}</ul>
          )}
        </section>

        {!visible ? <div className="card"><EmptyState title="Select a document" body="Choose a document from the queue to review it." /></div> : (
          <div className="flex flex-col gap-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[1.2rem] font-semibold tracking-[-0.015em]">{visible.title}</h2>
                <p className="text-[0.82rem] text-ink-3"><span className="mono">{visible.code}</span>, {visible.inst}{visible.fdr_id && <>, <Link className="link" href={`/fdrs/${visible.fdr_id}`}>open FDR</Link></>}</p>
              </div>
              <StatusBadge status={visible.status} />
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-[1fr_380px] gap-5">
              <Panel title="Document" description={cur ? `${cur.original_name}, version ${cur.version}` : undefined}
                actions={fileUrl ? <a href={fileUrl} target="_blank" rel="noopener" data-no-prerender className="btn btn-ghost btn-sm">Open <ExternalLink size={12} /></a> : undefined}>
                {fileUrl && cur ? (
                  cur.mime === "application/pdf"
                    ? <iframe src={fileUrl} title={`Preview of ${cur.original_name}`} className="w-full h-[460px] bg-[var(--sunken)]" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={fileUrl} alt={`Uploaded document ${cur.original_name}`} className="w-full max-h-[460px] object-contain bg-[var(--sunken)]" />
                ) : <EmptyState title="No file" />}
                {cur && <p className="px-4 py-2 border-t border-[var(--line)] text-[0.72rem] text-ink-3">Uploaded {fmtDateTime(cur.uploaded_at)} by {cur.uploader ?? "unknown"}. SHA-256 <span className="mono">{cur.sha256.slice(0, 16)}…</span>. Private file, link expires in 10 minutes.</p>}
              </Panel>

              <div className="flex flex-col gap-5">
                <Panel title="Register vs document" description="Document values are typed by the uploader and unverified">
                  <div className="px-4 py-3 mb-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.76rem] font-semibold text-ink-2">Source Verification Type</span>
                      {visible.status === "approved" ? (
                        <span className="badge badge-ok font-semibold">Bank Confirmed / Lien Marked</span>
                      ) : (
                        <span className="badge badge-warn font-semibold">Institution Submitted</span>
                      )}
                    </div>
                    <p className="text-[0.72rem] text-ink-3 leading-snug">
                      {visible.status === "approved"
                        ? "Independent bank confirmation or simulated e-verification recorded."
                        : "Awaiting primary source bank confirmation or API reconciliation."}
                    </p>
                  </div>
                  <table className="dtable">
                    <thead><tr><th>Field</th><th>Register</th><th>On document</th></tr></thead>
                    <tbody>{rowsCmp.map(([k, reg, dec, f]) => {
                      const diff = dec !== null && dec !== reg;
                      return (
                        <tr key={k}>
                          <td className="text-ink-3">{k}</td>
                          <td className="mono text-[0.8rem]">{f(reg)}</td>
                          <td className={`mono text-[0.8rem] ${diff ? "text-[var(--bad-ink)] font-semibold" : ""}`}>{f(dec)}{diff && <span className="block font-sans text-[0.7rem] font-normal">Differs</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </Panel>
                {visible.status === "pending_review" && can(u.role, "document.review") && cur && (
                  <Panel title="Decision"><ReviewForm documentId={visible.id} version={visible.current_version} /></Panel>
                )}
                <Panel title="Review history">
                  <Timeline events={[
                    ...reviews.map((r) => ({ ts: new Date(r.reviewed_at).getTime(), id: r.id, title: <>{titleCase(r.decision)} <span className="text-ink-3 font-normal">v{r.version}</span></>, meta: `${r.reviewer ?? "Reviewer"}, ${fmtDateTime(r.reviewed_at)}, ${r.mode === "manual" ? "manual review" : "simulated"}`, note: r.remarks })),
                    ...versions.map((v) => ({ ts: new Date(v.uploaded_at).getTime(), id: "v" + v.id, title: <>Version {v.version} uploaded</>, meta: `${v.uploader ?? "Unknown"}, ${fmtDateTime(v.uploaded_at)}`, note: null })),
                  ].sort((a, b) => b.ts - a.ts)} />
                </Panel>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
