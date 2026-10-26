import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { getSetting } from "@/lib/alert-engine";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { SettingsForm, RuleRow, ResetDemo, SchedulerForm, ClockForm } from "@/components/settings-forms";
import { schedulerConfig, lastScheduledRun } from "@/lib/scheduler";
import { clockOffsetDays, todayISO } from "@/lib/maturity";
import { fmtDate } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser("settings.manage");
  const [sched, last] = await Promise.all([schedulerConfig(), lastScheduledRun()]);
  const offset = clockOffsetDays();
  const realToday = fmtDate(todayISO(new Date()));
  const [thresholds, maxMb, pendingDays, sla, rules] = await Promise.all([
    getSetting<number[]>("reminder_thresholds", [30, 15, 7, 0]),
    getSetting<number>("max_file_mb", 5),
    getSetting<number>("verification_pending_days", 3),
    getSetting<number>("release_sla_days", 7),
    q<{ key: string; name: string; description: string; enabled: boolean; severity: string; assigned_role: Role; escalate_after_days: number }>(
      "select key, name, description, enabled, severity, assigned_role, escalate_after_days from alert_rules order by name"),
  ]);
  return (
    <div>
      <PageHeader title="Settings" description="Configurable demonstration values. None of these are official AICTE rules." />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-5 flex flex-col gap-5">
          <Panel title="Reminders and limits">
            <SettingsForm initial={{ thresholds: thresholds.join(", "), max_file_mb: maxMb, verification_pending_days: pendingDays, release_sla_days: sla }} />
          </Panel>
          <Panel title="Automatic checks" description="Runs the same rules as Run checks now">
            <SchedulerForm initial={sched} last={last} />
          </Panel>
          <div id="clock" className="scroll-mt-20">
            <Panel title="Simulated clock" description="Demonstration only">
              <ClockForm offset={offset} simulatedToday={fmtDate(todayISO())} realToday={realToday} />
            </Panel>
          </div>
          <Panel title="Demo data">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.84rem] text-ink-2 max-w-[44ch]">Restore the original synthetic data set so the demo walkthrough can be repeated from the start.</p>
              <ResetDemo />
            </div>
          </Panel>
        </div>
        <Panel className="xl:col-span-7" title="Alert rules" description="Escalation notifies administrators once an alert stays open this long">
          <div className="table-wrap"><table className="dtable">
            <thead><tr><th>Rule</th><th>Severity</th><th>Assigned to</th><th>Enabled</th><th>Escalate after (days)</th></tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.key}>
                <td className="max-w-[340px]"><span className="block font-medium">{r.name}</span><span className="text-[0.74rem] text-ink-3">{r.description}</span></td>
                <td><StatusBadge status={r.severity} /></td>
                <td className="text-ink-2 text-[0.82rem]">{ROLE_LABEL[r.assigned_role].split(" (")[0]}</td>
                <RuleRow rule={r} />
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
      </div>
    </div>
  );
}
