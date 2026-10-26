import { BellRing, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { linkFor } from "@/lib/alert-engine";
import { type SP } from "@/lib/list";
import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { RunChecksButton } from "@/components/run-checks";
import { AlertList, type AlertRow } from "@/components/alert-list";
import { schedulerConfig, lastScheduledRun } from "@/lib/scheduler";

export const metadata = { title: "Alerts & Notifications" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("alert.read");
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (status === "active") where.push("a.status <> 'resolved'");
  else if (["open", "acknowledged", "resolved"].includes(status)) add("a.status = ?", status);
  if (sp.severity) add("a.severity = ?", sp.severity);
  if (sp.rule) add("a.rule_key = ?", sp.rule);
  if (isScoped(u.role)) add("a.institution_id = ?", u.institutionId);
  const W = where.length ? `where ${where.join(" and ")}` : "";

  const [rows, rules, summary] = await Promise.all([
    q<Omit<AlertRow, "actions" | "link"> & { entity_type: string; entity_id: string }>(
      `select a.id, a.code, a.title, a.message, a.severity, a.status, a.rule_key as rule, r.name as rule_name, a.assigned_role, a.created_at, a.escalation_level, a.entity_type, a.entity_id
       from alerts a join alert_rules r on r.key=a.rule_key ${W}
       order by case a.status when 'open' then 0 when 'acknowledged' then 1 else 2 end, case a.severity when 'critical' then 0 when 'high' then 1 when 'warning' then 2 else 3 end, a.created_at desc limit 200`, params),
    q<{ key: string; name: string }>("select key, name from alert_rules order by name"),
    q<{ severity: string; n: number }>(`select severity, count(*)::int as n from alerts a where a.status <> 'resolved'${isScoped(u.role) ? " and a.institution_id=$1" : ""} group by severity`, isScoped(u.role) ? [u.institutionId] : []),
  ]);
  const [sched, lastAuto] = await Promise.all([schedulerConfig(), lastScheduledRun()]);
  const autoOn = sched.enabled && process.env.SCHEDULER !== "off";
  const ids = rows.map((r) => r.id);
  const actions = ids.length ? await q<AlertRow["actions"][number] & { alert_id: string }>(
    `select id, alert_id, action, actor_name, note, created_at from alert_actions where alert_id = any($1::uuid[]) order by created_at`, [ids]) : [];
  const list: AlertRow[] = rows.map((r) => ({ ...r, link: linkFor({ entityType: r.entity_type, entityId: r.entity_id }), actions: actions.filter((a) => a.alert_id === r.id) }));
  const sev = (s: string) => summary.find((x) => x.severity === s)?.n ?? 0;

  return (
    <div>
      <PageHeader title="Alerts and notifications" description="Raised by rules, never typed by hand. Each alert is unique per rule, record and threshold, so re-running checks never duplicates."
        actions={can(u.role, "alert.run") ? <RunChecksButton showResult /> : undefined} />

      <p className="mb-4 -mt-2 text-[0.82rem] text-ink-2 flex flex-wrap items-center gap-x-2">
        <span className={`inline-block w-2 h-2 rounded-full ${autoOn ? "bg-[var(--ok-dot)]" : "bg-[var(--neutral-dot)]"}`} aria-hidden />
        {autoOn ? `Automatic checks every ${sched.interval_minutes} min.` : "Automatic checks are paused."}
        {lastAuto && <span className="text-ink-3">Last automatic run {new Date(lastAuto.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}: {lastAuto.candidates} conditions, {lastAuto.created} new.</span>}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)] border border-[var(--line)] rounded-md overflow-hidden mb-6">
        {[["Critical", sev("critical"), "text-[var(--bad-ink)]"], ["High", sev("high"), "text-[var(--bad-ink)]"], ["Warning", sev("warning"), "text-[var(--warn-ink)]"], ["Info", sev("info"), ""]].map(([k, v, c]) => (
          <a key={String(k)} href={`/alerts?severity=${String(k).toLowerCase()}`} className="bg-[var(--surface)] px-4 py-3.5 hover:bg-[var(--surface-2)]">
            <p className="text-[0.76rem] text-ink-3">{k} open</p><p className={`figure text-[1.5rem] mt-1 ${Number(v) > 0 ? c : ""}`}>{v}</p>
          </a>
        ))}
      </div>

      <div className="card">
        <FilterBar filters={[
          { type: "select", name: "status", label: "Status", options: [{ value: "active", label: "Open and acknowledged" }, { value: "open", label: "Open" }, { value: "acknowledged", label: "Acknowledged" }, { value: "resolved", label: "Resolved" }, { value: "all", label: "Everything" }] },
          { type: "select", name: "severity", label: "Severity", options: ["critical", "high", "warning", "info"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
          { type: "select", name: "rule", label: "Rule", options: rules.map((r) => ({ value: r.key, label: r.name })) },
        ]} />
        {list.length === 0
          ? <EmptyState icon={BellRing} title="No alerts in this view" body={can(u.role, "alert.run") ? "Run checks to evaluate maturity thresholds, overdue reviews, missing documents and register mismatches." : "Nothing needs your attention."} />
          : <AlertList rows={list} canManage={can(u.role, "alert.manage")} focus={sp.focus} />}
      </div>

      <p className="mt-4 flex gap-2 text-[0.78rem] text-ink-3 max-w-[90ch]">
        <Info size={14} className="shrink-0 mt-0.5" />
        Notifications are in-app only; no email or SMS provider is configured. Automatic checks run inside the server process; on serverless hosting, call the cron endpoint described in the README.
      </p>
    </div>
  );
}
