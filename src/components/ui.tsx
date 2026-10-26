import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { BAND_LABEL, type MaturityBand } from "@/lib/maturity";
import { titleCase } from "@/lib/format";

/* ---------- Page header ---------- */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
      <div className="min-w-0">
        <h1 className="vt-title text-[1.6rem] font-semibold tracking-[-0.025em] leading-tight">{title}</h1>
        {description && <p className="text-[0.88rem] text-ink-3 mt-1 max-w-[72ch]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ---------- Status label: tinted text, never colour alone ---------- */
type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "violet";
const TONE: Record<string, Tone> = {
  draft: "neutral", submitted: "info", under_review: "info", verified: "ok", approved: "ok", action_required: "warn",
  changes_requested: "warn", matured: "violet", release_requested: "violet", released: "neutral", rejected: "bad",
  pending: "warn", pending_review: "warn", not_submitted: "neutral", uploaded: "info", info_requested: "warn",
  active: "ok", inactive: "neutral", suspended: "bad", renewed: "neutral", closed: "neutral", none: "neutral", initiated: "info",
  requested: "violet", open: "bad", acknowledged: "warn", resolved: "ok",
  critical: "bad", high: "bad", warning: "warn", info: "info",
  simulated: "violet", manual_confirmation: "ok", manual: "ok",
};
const LABEL: Record<string, string> = { released: "Release recorded", not_submitted: "Not submitted", pending_review: "Pending review", info_requested: "Info requested", manual_confirmation: "Manually confirmed" };

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-ink-3">-</span>;
  return <span className={`badge badge-${TONE[status] ?? "neutral"}`}>{label ?? LABEL[status] ?? titleCase(status)}</span>;
}

const BAND_TONE: Record<MaturityBand, Tone> = { closed: "neutral", overdue: "bad", due_today: "bad", within_7: "warn", within_15: "warn", within_30: "info", later: "neutral" };
export function BandBadge({ band }: { band: MaturityBand }) {
  return <span className={`badge badge-${BAND_TONE[band]}`}>{BAND_LABEL[band]}</span>;
}

/* ---------- KPI ledger: one strip, hairline dividers, mono figures ---------- */
export type Stat = { label: string; value?: React.ReactNode; sub?: React.ReactNode; href?: string; title?: string; alert?: boolean };

export function StatStrip({ stats, loading, cols = 6 }: { stats: Stat[]; loading?: boolean; cols?: 4 | 6 }) {
  return (
    // 1px gaps over a hairline-coloured background draw the dividers at every breakpoint.
    <div className={`grid grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-6"} gap-px bg-[var(--line)] border border-[var(--line)] rounded-md overflow-hidden mb-6`}>
      {stats.map((s, i) => {
        const body = (
          <div className={`h-full px-4 py-3.5 flex flex-col gap-1.5 ${s.href && !loading ? "hover:bg-[var(--surface-2)] transition-colors" : ""}`}>
            <span className="text-[0.76rem] text-ink-3">{s.label}</span>
            {loading ? <span className="skeleton block h-7 w-20" /> : (
              <span className={`figure text-[1.65rem] leading-none font-medium ${s.alert ? "text-[var(--bad-ink)]" : ""}`} title={s.title}>{s.value}</span>
            )}
            {loading ? <span className="skeleton block h-3 w-28" /> : <span className="text-[0.74rem] text-ink-3 truncate">{s.sub}</span>}
          </div>
        );
        const cls = "min-w-0 bg-[var(--surface)]";
        return s.href && !loading ? <Link key={s.label || i} href={s.href} className={cls}>{body}</Link> : <div key={s.label || i} className={cls}>{body}</div>;
      })}
    </div>
  );
}

/* ---------- Section: headed container ---------- */
export function Panel({ title, description, actions, children, className = "", bodyClass = "" }: {
  title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`card flex flex-col min-w-0 ${className}`} aria-label={title}>
      <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--line)]">
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 className="text-[0.9rem] font-semibold tracking-[-0.01em] truncate">{title}</h2>
          {description && <p className="hidden sm:block text-[0.76rem] text-ink-3 truncate">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon size={20} strokeWidth={1.5} className="mx-auto text-ink-3" aria-hidden />
      <p className="mt-2.5 text-[0.88rem] font-medium">{title}</p>
      {body && <p className="text-[0.8rem] text-ink-3 mt-1 max-w-[44ch] mx-auto">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-12 border-t border-[var(--line)] text-[0.78rem] text-ink-3">
      <span className="tabular">{from}-{to} of {total}</span>
      <div className="flex items-center gap-1">
        {page > 1 ? <Link className="btn btn-ghost btn-sm" href={hrefFor(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /> Previous</Link>
          : <span className="btn btn-ghost btn-sm opacity-40" aria-disabled><ChevronLeft size={14} /> Previous</span>}
        <span className="px-1.5 tabular">{page} / {pages}</span>
        {page < pages ? <Link className="btn btn-ghost btn-sm" href={hrefFor(page + 1)} aria-label="Next page">Next <ChevronRight size={14} /></Link>
          : <span className="btn btn-ghost btn-sm opacity-40" aria-disabled>Next <ChevronRight size={14} /></span>}
      </div>
    </div>
  );
}

/* ---------- Detail list ---------- */
export function DL({ items, cols = 2 }: { items: Array<[string, React.ReactNode]>; cols?: 2 | 3 }) {
  return (
    <dl className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""} gap-x-6 gap-y-4 p-4`}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[0.74rem] text-ink-3">{k}</dt>
          <dd className="mt-0.5 text-[0.88rem] break-words">{v ?? <span className="text-ink-3">-</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Timeline ---------- */
export function Timeline({ events }: { events: Array<{ id: string | number; title: React.ReactNode; meta: React.ReactNode; note?: string | null }> }) {
  if (!events.length) return <p className="p-4 text-sm text-ink-3">No history yet.</p>;
  return (
    <ol className="p-4">
      {events.map((e, i) => (
        <li key={e.id} className="relative pl-5 pb-4 last:pb-0">
          <span className="absolute left-0 top-[7px] w-[7px] h-[7px] rounded-full border-[1.5px] border-[var(--ink-3)] bg-[var(--surface)]" aria-hidden />
          {i < events.length - 1 && <span className="absolute left-[3px] top-[16px] bottom-0 w-px bg-[var(--line)]" aria-hidden />}
          <p className="text-[0.84rem] font-medium">{e.title}</p>
          <p className="text-[0.74rem] text-ink-3">{e.meta}</p>
          {e.note && <p className="mt-1.5 text-[0.8rem] text-ink-2 border-l-2 border-[var(--line-strong)] pl-2.5">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Skeletons built from the same components as the loaded page (#1) ---------- */
export function TableSkeleton({ cols = 6, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead><tr>{Array.from({ length: cols }, (_, i) => <th key={i}><span className="skeleton block h-3 w-14" /></th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }, (_, r) => (
          <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c}><span className="skeleton block h-3.5" style={{ width: `${45 + ((r * 7 + c * 13) % 45)}%` }} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function PageSkeleton({ stats = 0, cols = 6, title = "Loading" }: { stats?: number; cols?: number; title?: string }) {
  return (
    <div className="delayed-reveal" aria-busy="true" aria-label={title}>
      <div className="mb-6"><span className="skeleton block h-7 w-56" /><span className="skeleton block h-4 w-[26rem] max-w-full mt-2" /></div>
      {stats > 0 && <StatStrip loading stats={Array.from({ length: stats }, () => ({ label: "" }))} />}
      <div className="card"><div className="px-4 py-3 border-b border-[var(--line)]"><span className="skeleton block h-8 w-full max-w-[480px]" /></div><TableSkeleton cols={cols} /></div>
    </div>
  );
}
