import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { formatINR, formatINRCompact, toPaise } from "@/lib/money";
import { fmtDate, fmtDateTime, relativeDays, titleCase } from "@/lib/format";
import { daysUntil, maturityBand } from "@/lib/maturity";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { DEPOSIT_TYPES } from "@/lib/validation";
import { PageHeader, StatStrip, Panel, StatusBadge, BandBadge, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { HBar, Columns, type Datum } from "@/components/charts";
import { RunChecksButton } from "@/components/run-checks";
import { CountUp } from "@/components/count-up";

export const metadata = { title: "Overview" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rupees = (v: string) => Number(toPaise(v) / 100n); // chart geometry only; every displayed figure uses exact strings
const more = (href: string, label: string) => (
  <Link href={href} className="btn btn-ghost btn-sm text-ink-3">{label}<ArrowUpRight size={13} /></Link>
);

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const d = await getDashboard(u, sp);
  const institutions = isScoped(u.role) ? [] : await q<{ id: string; name: string }>("select id, name from institutions order by name");

  const monthData: Datum[] = (() => {
    const map = new Map(d.byMonth.map((m) => [m.month, m]));
    const [y, m] = d.today.split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const yy = y + Math.floor((m - 1 + i) / 12);
      const mm = ((m - 1 + i) % 12) + 1;
      const row = map.get(`${yy}-${String(mm).padStart(2, "0")}`);
      // Urgency heats the nearest months: this month amber, next month full cobalt, later months recede.
      const color = i === 0 ? "var(--warn-dot)" : i === 1 ? "var(--c1)" : "color-mix(in srgb, var(--c1) 45%, var(--surface))";
      return { label: `${MONTHS[mm - 1]}${mm === 1 || i === 0 ? ` ${String(yy).slice(2)}` : ""}`, value: row?.n ?? 0, color,
        display: `${row?.n ?? 0} FDR${row?.n === 1 ? "" : "s"}`, sub: row ? formatINRCompact(row.value) : undefined };
    });
  })();
  const next12 = monthData.reduce((a, x) => a + x.value, 0);
  const STATUS_COLOR: Record<string, string> = {
    verified: "var(--ok-dot)", under_review: "var(--info-dot)", submitted: "var(--info-dot)", draft: "var(--neutral-dot)",
    action_required: "var(--warn-dot)", release_requested: "var(--violet-dot)", matured: "var(--violet-dot)", released: "var(--neutral-dot)", rejected: "var(--bad-dot)",
  };
  const statusData: Datum[] = d.byStatus.map((s) => ({ label: titleCase(s.status), value: rupees(s.value), display: formatINRCompact(s.value), sub: `${s.n} deposit${s.n === 1 ? "" : "s"}`, color: STATUS_COLOR[s.status] }));
  const top = d.byInst.slice(0, 6);
  const rest = d.byInst.slice(6);
  const instData: Datum[] = top.map((i) => ({ label: i.name, value: rupees(i.value), display: formatINRCompact(i.value) }));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = u.name.split(" ")[0];
  const headline = d.kpi.week + d.kpi.past_due === 0
    ? "Nothing matures this week."
    : `${d.kpi.week} FDR${d.kpi.week === 1 ? "" : "s"} mature this week${d.kpi.past_due ? `, and ${d.kpi.past_due} matured without a next step` : ""}.`;
  if (rest.length) {
    const p = rest.reduce((a, r) => a + toPaise(r.value), 0n);
    const s = `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
    instData.push({ label: `${rest.length} other institutions`, value: rupees(s), display: formatINRCompact(s) });
  }
  const urgent = d.kpi.overdue_rel + d.kpi.stale_docs;
  const pendingTotal = d.workload.find((w) => w.status === "pending_review")?.n ?? 0;

  return (
    <div>
      {sp.denied && <p role="alert" className="mb-4 rounded-md bg-[var(--warn-bg)] text-[var(--warn-ink)] px-3 py-2 text-sm">Your role does not have access to that page.</p>}
      {/* The one colour-owned region: what needs attention today. */}
      <section className="hero-band relative overflow-hidden rounded-xl text-[var(--hero-ink)] mb-6" aria-label="Today">
        <div className="relative px-6 pt-6 pb-5 md:px-8 md:pt-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[0.84rem] text-[var(--hero-ink-2)]">{fmtDate(d.today)}</p>
            <h1 className="vt-title text-[1.9rem] md:text-[2.3rem] leading-[1.1] font-semibold tracking-[-0.03em] mt-1">{greeting}, {firstName}.</h1>
            <p className="text-[1.02rem] text-[var(--hero-ink-2)] mt-2 max-w-[56ch]">{headline}</p>
          </div>
          {can(u.role, "alert.run") && <RunChecksButton variant="light" />}
        </div>
        <dl className="relative grid grid-cols-2 lg:grid-cols-4 border-t border-[var(--hero-line)]">
          {[
            { k: "Maturing in 7 days", v: d.kpi.week, s: d.kpi.week ? formatINRCompact(d.kpi.week_value) : "None", href: "/calendar?view=list" },
            { k: "Matured, no next step", v: d.kpi.past_due, s: d.kpi.past_due ? "Renew or release" : "All handled", href: "/fdrs?window=overdue" },
            { k: "Awaiting verification", v: d.kpi.pending_docs, s: d.kpi.stale_docs ? `${d.kpi.stale_docs} over ${d.pendingDays} days` : "Within target", href: "/verification" },
            { k: "Open alerts", v: d.kpi.open_alerts, s: d.kpi.open_alerts ? "Review and acknowledge" : "Run checks to evaluate", href: "/alerts" },
          ].map((x, i) => (
            <Link key={x.k} href={x.href} className={`group px-6 md:px-8 py-4 hover:bg-[var(--hero-chip)] transition-colors ${i % 2 ? "border-l" : ""} lg:border-l lg:first:border-l-0 border-[var(--hero-line)] ${i > 1 ? "border-t lg:border-t-0" : ""}`}>
              <dt className="text-[0.78rem] text-[var(--hero-ink-2)]">{x.k}</dt>
              <dd className="figure text-[2rem] leading-none mt-1.5"><CountUp value={x.v} /></dd>
              <dd className="text-[0.76rem] text-[var(--hero-ink-2)] mt-1.5 flex items-center gap-1">{x.s}<ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" /></dd>
            </Link>
          ))}
        </dl>
      </section>

      <div className="-mx-4 mb-4 [&>div]:border-b-0 [&>div]:py-0">
        <FilterBar filters={[
          ...(institutions.length ? [{ type: "select" as const, name: "institution", label: "Institution", options: institutions.map((i) => ({ value: i.id, label: i.name })) }] : []),
          { type: "select", name: "type", label: "Type", options: DEPOSIT_TYPES.map((t) => ({ value: t, label: t })) },
          { type: "date", name: "from", label: "Deposited from" },
          { type: "date", name: "to", label: "to" },
        ]} />
      </div>

      <StatStrip cols={4} stats={[
        { label: "Institutions", value: <CountUp value={d.institutions.n} />, sub: `${d.institutions.active} active`, href: "/institutions" },
        { label: "Active deposits", value: <CountUp value={d.kpi.active} />, sub: "excl. released and rejected", href: "/deposits" },
        { label: "Recorded value", value: formatINRCompact(d.kpi.value), title: formatINR(d.kpi.value), sub: formatINR(d.kpi.value, { decimals: false }), href: "/reports?r=deposit_register" },
        { label: "Overdue workflow", value: <CountUp value={urgent} />, sub: `${d.kpi.overdue_rel} release, ${d.kpi.stale_docs} review`, href: "/reports?r=overdue_workflow", alert: urgent > 0 },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-5">
        <Panel className="xl:col-span-8" title="Maturity watchlist" description="Next 45 days and matured FDRs still awaiting action" actions={more("/calendar", "Calendar")}>
          {d.upcoming.length === 0 ? <EmptyState title="Nothing maturing soon" body="No active FDR matures in the next 45 days." /> : (
            <div className="table-wrap">
              <table className="dtable">
                <thead><tr><th>FDR</th><th>Institution</th><th className="r">Principal</th><th>Matures</th><th>Status</th></tr></thead>
                <tbody>
                  {d.upcoming.map((f) => {
                    const days = daysUntil(f.maturity_date, d.today);
                    return (
                      <tr key={f.id}>
                        <td><Link href={`/fdrs/${f.id}`} className="mono link">{f.fdr_number}</Link></td>
                        <td className="max-w-[220px] truncate text-ink-2" title={f.inst}>{f.inst}</td>
                        <td className="r">{formatINR(f.principal, { decimals: false })}</td>
                        <td className="whitespace-nowrap">{fmtDate(f.maturity_date)}<span className={`block text-[0.72rem] ${days < 0 ? "text-[var(--bad-ink)]" : "text-ink-3"}`}>{relativeDays(days)}</span></td>
                        <td><BandBadge band={maturityBand(f.maturity_date, d.today, f.lifecycle_status)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="xl:col-span-4 flex flex-col gap-4">
          <Panel title="Needs attention" actions={more("/alerts", "Alerts")}>
            {d.alerts.length === 0 && d.overdue.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No urgent alerts" body={can(u.role, "alert.run") ? "Run checks to evaluate every rule against today's date." : "Alerts appear here after the checks run."} />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {d.alerts.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/alerts?focus=${a.id}`} className="text-[0.84rem] font-medium leading-snug hover:underline underline-offset-2">{a.title}</Link>
                      <StatusBadge status={a.severity} />
                    </div>
                    <p className="text-[0.72rem] text-ink-3 mt-0.5">{fmtDateTime(a.created_at)}</p>
                  </li>
                ))}
                {d.overdue.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/releases?open=${r.id}`} className="text-[0.84rem] font-medium hover:underline underline-offset-2">Release <span className="mono">{r.code}</span> is overdue</Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-[0.72rem] text-ink-3 mt-0.5 truncate">{r.inst}, due {fmtDate(r.due_date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Verification queue" description={`${pendingTotal} waiting`} actions={more("/verification", "Open")}>
            {d.queue.length === 0 ? <EmptyState title="Queue is clear" /> : (
              <ul className="divide-y divide-[var(--line)]">{d.queue.slice(0, 4).map((x) => (
                <li key={x.id} className="px-4 py-2.5">
                  <Link href={`/verification?doc=${x.id}`} className="text-[0.84rem] font-medium hover:underline underline-offset-2">{x.title}</Link>
                  <p className="text-[0.72rem] text-ink-3 truncate">{x.inst}, since {fmtDate(x.updated_at)}</p>
                </li>
              ))}</ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-5">
        <Panel className="xl:col-span-7 reveal" title={`${next12} FDRs mature in the next 12 months`} description="This month in amber, next month in cobalt" bodyClass="px-3 pt-3 pb-1">
          <Columns data={monthData} caption="FDR maturities by month" />
        </Panel>
        <Panel className="xl:col-span-5 reveal" title="Value by status" description="Recorded principal" bodyClass="px-3 py-3">
          <HBar data={statusData} caption="Deposit value by status" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Panel className="xl:col-span-5 reveal" title="Where the value sits" description="Active principal by institution" bodyClass="px-3 py-3">
          <HBar data={instData} caption="Institution-wise deposit distribution" color="var(--c2)" />
        </Panel>
        <Panel className="xl:col-span-7 reveal" title="Recent activity" actions={can(u.role, "audit.read") ? more("/audit", "Audit trail") : undefined}>
          <div className="grid sm:grid-cols-2 sm:divide-x divide-[var(--line)]">
            <ul className="divide-y divide-[var(--line)]">
              {d.recent.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><Link href={`/deposits/${r.id}`} className="mono link text-[0.8rem]">{r.code}</Link>
                    <p className="text-[0.72rem] text-ink-3 truncate">{r.inst}</p></div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-[var(--line)] border-t sm:border-t-0 border-[var(--line)]">
              {d.audit.length === 0 ? <li className="px-4 py-6 text-[0.8rem] text-ink-3">The audit trail is visible to administrators and auditors.</li> : d.audit.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <p className="text-[0.8rem] truncate"><span className="font-medium">{a.actor_name}</span> <span className="mono text-ink-3 text-[0.74rem]">{a.action}</span></p>
                  <p className="text-[0.72rem] text-ink-3 truncate">{a.entity_label ?? "System"}, {fmtDateTime(a.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
