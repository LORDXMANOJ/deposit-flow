import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { isScoped } from "@/lib/rbac";
import { formatINR, formatINRCompact, sumAmounts } from "@/lib/money";
import { fmtDate, relativeDays } from "@/lib/format";
import { daysUntil, maturityBand, todayISO, type MaturityBand } from "@/lib/maturity";
import { PageHeader, StatusBadge, BandBadge, EmptyState } from "@/components/ui";

export const metadata = { title: "Maturity Calendar" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHIP: Record<MaturityBand, string> = {
  overdue: "bg-[var(--bad-bg)] text-[var(--bad-ink)]", due_today: "bg-[var(--bad-bg)] text-[var(--bad-ink)]",
  within_7: "bg-[var(--warn-bg)] text-[var(--warn-ink)]", within_15: "bg-[var(--warn-bg)] text-[var(--warn-ink)]",
  within_30: "bg-[var(--info-bg)] text-[var(--info-ink)]", later: "bg-[var(--neutral-bg)] text-[var(--neutral-ink)]", closed: "bg-[var(--neutral-bg)] text-ink-3 line-through",
};

function nextAction(band: MaturityBand, verification: string, renewal: string) {
  if (band === "closed") return "None";
  if (verification !== "approved") return "Verify receipt";
  if (renewal !== "none" && renewal !== "rejected") return "Track renewal";
  if (band === "overdue") return "Renew or release";
  if (band === "due_today" || band === "within_7") return "Decide this week";
  return "Monitor";
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string }> }) {
  const u = await requireUser("deposit.read");
  const sp = await searchParams;
  const today = todayISO();
  const [ty, tm] = today.split("-").map(Number);
  const [y, m] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [ty, tm];
  const view = sp.view === "list" ? "list" : "month";
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${daysInMonth}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const scope = isScoped(u.role) ? " and f.institution_id = $3" : "";

  const rows = await q<{ id: string; fdr_number: string; inst: string; principal: string; maturity_date: string; lifecycle_status: string; verification_status: string; renewal_status: string }>(
    `select f.id, f.fdr_number, i.name as inst, f.principal, f.maturity_date, f.lifecycle_status, f.verification_status, f.renewal_status
     from fdr_records f join institutions i on i.id=f.institution_id where f.maturity_date between $1 and $2${scope} order by f.maturity_date, f.principal desc`,
    isScoped(u.role) ? [first, last, u.institutionId] : [first, last]);
  const byDay = new Map<number, typeof rows>();
  for (const r of rows) {
    const d = Number(r.maturity_date.slice(8, 10));
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => i - lead + 1);
  const total = sumAmounts(rows.map((r) => r.principal));
  const link = (patch: { m?: string; view?: string }) => {
    const p = new URLSearchParams({ m: patch.m ?? `${y}-${String(m).padStart(2, "0")}`, view: patch.view ?? view });
    return `/calendar?${p}`;
  };

  return (
    <div>
      <PageHeader title="Maturity calendar" description={`${rows.length} FDR${rows.length === 1 ? "" : "s"} mature in ${MONTHS[m - 1]} ${y}, ${formatINRCompact(total)} principal.`}
        actions={<>
          <div className="inline-flex rounded-md border border-[var(--line-strong)] p-0.5 bg-[var(--surface)]" role="tablist" aria-label="View">
            {(["month", "list"] as const).map((v) => (
              <Link key={v} href={link({ view: v })} role="tab" aria-selected={view === v} className={`px-3 h-7 inline-flex items-center rounded text-[0.8rem] font-medium ${view === v ? "bg-[var(--btn-bg)] text-[var(--btn-ink)]" : "text-ink-2 hover:text-ink"}`}>{v === "month" ? "Month" : "List"}</Link>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <Link href={link({ m: prev })} className="btn btn-secondary btn-icon" aria-label="Previous month"><ChevronLeft size={16} /></Link>
            <Link href={link({ m: `${ty}-${String(tm).padStart(2, "0")}` })} className="btn btn-secondary">Today</Link>
            <Link href={link({ m: next })} className="btn btn-secondary btn-icon" aria-label="Next month"><ChevronRight size={16} /></Link>
          </div>
        </>} />

      <h2 className="text-[1.15rem] font-semibold tracking-[-0.015em] mb-3">{MONTHS[m - 1]} <span className="text-ink-3 font-normal">{y}</span></h2>

      {view === "month" ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--surface-2)]">
            {DOW.map((d) => <div key={d} className="px-2.5 py-2 text-[0.72rem] font-medium text-ink-3">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--line)]">
            {cells.map((day, i) => {
              const inMonth = day >= 1 && day <= daysInMonth;
              const iso = inMonth ? `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
              const items = inMonth ? byDay.get(day) ?? [] : [];
              const isToday = iso === today;
              return (
                <div key={i} className={`min-h-[104px] p-1.5 ${inMonth ? "bg-[var(--surface)]" : "bg-[var(--surface-2)]"}`}>
                  {inMonth && (
                    <span className={`inline-grid place-items-center w-6 h-6 rounded-full text-[0.75rem] tabular ${isToday ? "bg-[var(--accent)] text-white font-semibold" : "text-ink-3"}`} aria-label={isToday ? "Today" : undefined}>{day}</span>
                  )}
                  <ul className="mt-1 space-y-1">
                    {items.slice(0, 3).map((r) => {
                      const band = maturityBand(r.maturity_date, today, r.lifecycle_status);
                      return (
                        <li key={r.id}>
                          <Link href={`/fdrs/${r.id}`} title={`${r.fdr_number}, ${r.inst}, ${formatINR(r.principal, { decimals: false })}`}
                            className={`block rounded px-1.5 py-1 text-[0.7rem] leading-tight hover:brightness-95 ${CHIP[band]}`}>
                            <span className="mono block truncate font-medium">{r.fdr_number.replace("DEMO-FDR-", "")}</span>
                            <span className="hidden md:block truncate opacity-80">{formatINRCompact(r.principal)}</span>
                          </Link>
                        </li>
                      );
                    })}
                    {items.length > 3 && <li><Link href={link({ view: "list" })} className="text-[0.7rem] text-ink-3 hover:text-ink px-1">+{items.length - 3} more</Link></li>}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-[var(--line)] text-[0.72rem] text-ink-3">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--bad-bg)] border border-[var(--bad-dot)]" />Overdue or due today</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--warn-bg)] border border-[var(--warn-dot)]" />Within 15 days</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--info-bg)] border border-[var(--info-dot)]" />Within 30 days</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--neutral-bg)] border border-[var(--neutral-dot)]" />Later or closed</span>
          </div>
        </div>
      ) : (
        <div className="card">
          {rows.length === 0 ? <EmptyState title={`Nothing matures in ${MONTHS[m - 1]}`} /> : (
            <div className="table-wrap"><table className="dtable">
              <thead><tr><th>Matures</th><th>FDR</th><th>Institution</th><th className="r">Deposit value</th><th>Band</th><th>Verification</th><th>Next action</th></tr></thead>
              <tbody>{rows.map((r) => {
                const band = maturityBand(r.maturity_date, today, r.lifecycle_status);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDate(r.maturity_date)}<span className="block text-[0.72rem] text-ink-3">{relativeDays(daysUntil(r.maturity_date, today))}</span></td>
                    <td><Link href={`/fdrs/${r.id}`} className="mono link">{r.fdr_number}</Link></td>
                    <td className="max-w-[240px] truncate text-ink-2">{r.inst}</td>
                    <td className="r">{formatINR(r.principal, { decimals: false })}</td>
                    <td><BandBadge band={band} /></td>
                    <td><StatusBadge status={r.verification_status} /></td>
                    <td className="text-[0.82rem]">{nextAction(band, r.verification_status, r.renewal_status)}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
