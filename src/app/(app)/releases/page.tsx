import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime, relativeDays, titleCase } from "@/lib/format";
import { daysUntil, todayISO } from "@/lib/maturity";
import { PageHeader, Panel, DL, StatusBadge, EmptyState, Timeline } from "@/components/ui";
import { ReleaseRequestButton } from "@/components/release-request";
import { ReleaseActions } from "@/components/release-actions";
import { ReleaseStepper } from "@/components/release-stepper";

export const metadata = { title: "Release & Refund" };

const TABS = [["open", "Open"], ["approved", "Approved"], ["released", "Recorded"], ["rejected", "Rejected"], ["all", "All"]] as const;

export default async function ReleasesPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const u = await requireUser("deposit.read");
  const sp = await searchParams;
  const today = todayISO();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "open";
  const conds: string[] = [];
  const params: unknown[] = [];
  if (tab === "open") conds.push("r.status in ('submitted','under_review','info_requested')");
  else if (tab !== "all") { params.push(tab); conds.push(`r.status = $${params.length}`); }
  if (isScoped(u.role)) { params.push(u.institutionId); conds.push(`r.institution_id = $${params.length}`); }
  const W = conds.length ? `where ${conds.join(" and ")}` : "";

  const list = await q<{ id: string; code: string; status: string; inst: string; dep_code: string; principal: string; due_date: string; created_at: string }>(
    `select r.id, r.code, r.status, i.name as inst, d.code as dep_code, d.principal, r.due_date, r.created_at from release_requests r
     join deposits d on d.id=r.deposit_id join institutions i on i.id=r.institution_id ${W} order by r.created_at desc limit 80`, params);
  const selId = sp.open && /^[0-9a-f-]{36}$/.test(sp.open) ? sp.open : list[0]?.id;
  const sel = selId ? await one<{ id: string; code: string; status: string; reason: string; deposit_id: string; dep_code: string; principal: string; institution_id: string; inst: string;
    fdr_id: string | null; fdr_number: string | null; requester: string | null; requested_by: string | null; reviewer: string | null; reviewer_comments: string | null; decided_at: string | null;
    outcome_ref: string | null; outcome_mode: string | null; processor: string | null; processed_at: string | null; due_date: string; created_at: string }>(
    `select r.*, d.code as dep_code, d.principal, i.name as inst, f.fdr_number, a.full_name as requester, b.full_name as reviewer, c.full_name as processor
     from release_requests r join deposits d on d.id=r.deposit_id join institutions i on i.id=r.institution_id left join fdr_records f on f.id=r.fdr_id
     left join profiles a on a.id=r.requested_by left join profiles b on b.id=r.reviewer_id left join profiles c on c.id=r.processed_by where r.id=$1`, [selId]) : null;
  const visible = sel && (!isScoped(u.role) || sel.institution_id === u.institutionId) ? sel : null;
  const events = visible ? await q<{ id: number; from_status: string | null; to_status: string; actor_name: string | null; note: string | null; created_at: string }>(
    "select id, from_status, to_status, actor_name, note, created_at from workflow_events where entity_type='release' and entity_id=$1 order by created_at desc", [visible.id]) : [];

  const eligible = can(u.role, "release.create") ? await q<{ id: string; label: string }>(
    `select d.id, d.code || ', ' || i.name as label from deposits d join institutions i on i.id=d.institution_id
     where d.verification_status='approved' and d.status not in ('release_requested','released','rejected')${isScoped(u.role) ? " and d.institution_id=$1" : ""} order by d.code`,
    isScoped(u.role) ? [u.institutionId] : []) : [];

  // Allowed next steps for THIS user (mirrors the server-side transition table).
  type Act = Parameters<typeof ReleaseActions>[0]["actions"][number];
  const actions: Act[] = [];
  if (visible) {
    const own = visible.requested_by === u.id;
    if (can(u.role, "release.review")) {
      if (visible.status === "submitted") actions.push({ to: "under_review", label: "Start review", tone: "secondary", explain: "Moves the request into review. The requester can see that it is being reviewed." });
      if (visible.status === "under_review") {
        if (!own) actions.push({ to: "approved", label: "Approve", explain: "Approves the release. An authorized officer must still record the outcome before the deposit is marked released." });
        actions.push({ to: "info_requested", label: "Request information", tone: "secondary", needsComment: true, explain: "Sends the request back to the institution with your question." });
        actions.push({ to: "rejected", label: "Reject", tone: "danger", needsComment: true, explain: "Rejects the request. The deposit returns to verified status." });
      }
    }
    if (visible.status === "info_requested" && (can(u.role, "release.review") || (u.role === "institution" && visible.institution_id === u.institutionId)))
      actions.push({ to: "under_review", label: u.role === "institution" ? "Respond and resubmit" : "Resume review", tone: "secondary", needsComment: u.role === "institution", explain: "Returns the request to review." });
    if (visible.status === "approved" && can(u.role, "release.process") && !own)
      actions.push({ to: "released", label: "Record outcome", outcome: true, explain: "Records that the deposit was released. Choose simulated for the demo, or enter a real reference you have confirmed separately." });
  }
  const overdue = visible && ["submitted", "under_review", "info_requested"].includes(visible.status) && visible.due_date < today;

  return (
    <div>
      <PageHeader title="Release and refund requests" description="Submitted, reviewed, decided and recorded as separate, audited steps. No step moves money."
        actions={can(u.role, "release.create") ? <ReleaseRequestButton options={eligible} openOnParam /> : undefined} />

      <nav className="flex gap-1 mb-4 overflow-x-auto scroll-thin" aria-label="Request status">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/releases?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`px-3 h-8 inline-flex items-center rounded-md text-[0.82rem] whitespace-nowrap ${tab === k ? "bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)] font-medium text-ink" : "text-ink-3 hover:text-ink hover:bg-[var(--sunken)]"}`}>{label}</Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_1fr] gap-5 items-start">
        <section className="card" aria-label="Requests">
          {list.length === 0 ? <EmptyState icon={ArrowRightLeft} title="No requests here" /> : (
            <ul className="divide-y divide-[var(--line)]">{list.map((r) => {
              const late = ["submitted", "under_review", "info_requested"].includes(r.status) && r.due_date < today;
              return (
                <li key={r.id}>
                  <Link href={`/releases?tab=${tab}&open=${r.id}`} scroll={false} className={`block px-4 py-3 ${r.id === visible?.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}>
                    <div className="flex items-center justify-between gap-2"><span className="mono text-[0.84rem] font-medium">{r.code}</span><StatusBadge status={r.status} /></div>
                    <p className="text-[0.76rem] text-ink-2 truncate mt-0.5">{r.inst}</p>
                    <p className={`text-[0.72rem] mt-0.5 ${late ? "text-[var(--bad-ink)]" : "text-ink-3"}`}><span className="mono">{r.dep_code}</span>, due {fmtDate(r.due_date)}{late ? " (overdue)" : ""}</p>
                  </Link>
                </li>
              );
            })}</ul>
          )}
        </section>

        {!visible ? <div className="card"><EmptyState title="Select a request" /></div> : (
          <div className="flex flex-col gap-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em] mono">{visible.code}</h2>
                <p className="text-[0.84rem] text-ink-3">{visible.inst}, deposit <Link href={`/deposits/${visible.deposit_id}`} className="link mono">{visible.dep_code}</Link></p>
              </div>
              <div className="flex gap-1.5">{visible.outcome_mode && <StatusBadge status={visible.outcome_mode} />}<StatusBadge status={visible.status} /></div>
            </div>
            {overdue && <p className="text-[0.84rem] text-[var(--bad-ink)] bg-[var(--bad-bg)] rounded-md px-3 py-2">Past its due date ({relativeDays(daysUntil(visible.due_date, today))}). Overdue requests raise an alert when checks run.</p>}
            {actions.length > 0 && <div className="card p-4"><p className="text-[0.8rem] text-ink-3 mb-3">Available to you as {u.role === "finance" ? "Finance / Authorized Officer" : titleCase(u.role)}</p><ReleaseActions id={visible.id} code={visible.code} actions={actions} /></div>}
            <ReleaseStepper status={visible.status} requester={visible.requester} createdAt={visible.created_at} reviewer={visible.reviewer} decidedAt={visible.decided_at}
              comments={visible.reviewer_comments} processor={visible.processor} processedAt={visible.processed_at} outcomeRef={visible.outcome_ref} outcomeMode={visible.outcome_mode}
              when={(iso) => (iso ? fmtDateTime(iso) : "-")} />
            {visible.requested_by === u.id && ["under_review", "approved"].includes(visible.status) && (
              <p className="text-[0.8rem] text-ink-3">You raised this request, so approval and the recorded outcome must come from someone else.</p>
            )}
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
              <Panel title="Request">
                <DL items={[
                  ["Reason", visible.reason],
                  ["Deposit value", formatINR(visible.principal)],
                  ["FDR", visible.fdr_number ? <Link key="f" href={`/fdrs/${visible.fdr_id}`} className="link mono">{visible.fdr_number}</Link> : null],
                  ["Requested by", `${visible.requester ?? "Unknown"}, ${fmtDateTime(visible.created_at)}`],
                  ["Due", fmtDate(visible.due_date)],
                  ["Reviewer", visible.reviewer ? `${visible.reviewer}${visible.decided_at ? `, ${fmtDateTime(visible.decided_at)}` : ""}` : null],
                  ["Reviewer comments", visible.reviewer_comments],
                  ["Outcome", visible.outcome_ref ? <span key="o"><span className="mono">{visible.outcome_ref}</span>{visible.processor ? `, ${visible.processor}` : ""}</span> : null],
                ]} />
              </Panel>
              <Panel title="Workflow history">
                <Timeline events={events.map((e) => ({ id: e.id, title: e.from_status ? <>{titleCase(e.from_status)} <span className="text-ink-3">to</span> {titleCase(e.to_status)}</> : titleCase(e.to_status),
                  meta: `${e.actor_name ?? "System"}, ${fmtDateTime(e.created_at)}`, note: e.note }))} />
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
