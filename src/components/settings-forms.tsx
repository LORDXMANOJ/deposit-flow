"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettings, toggleRule, resetDemoData, saveScheduler, setSimulatedClock } from "@/app/actions/workflow";
import { signOut } from "@/app/actions/auth";
import { ConfirmDialog, Field } from "./forms";
import { useToast } from "./toast";

export function SettingsForm({ initial }: { initial: { thresholds: string; max_file_mb: number; verification_pending_days: number; release_sla_days: number } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <form className="p-4 grid sm:grid-cols-2 gap-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveSettings(v);
        if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast({ title: "Not saved", description: r.error, tone: "error" }); return; }
        setErrors({});
        toast({ title: "Settings saved", description: "The next alert check uses the new values." });
        router.refresh();
      });
    }}>
      <Field label="Maturity reminder thresholds (days before)" htmlFor="s-th" error={errors.thresholds} hint="Comma separated. 0 means on the maturity date." className="sm:col-span-2">
        <input id="s-th" className="input mono" value={v.thresholds} onChange={(e) => setV({ ...v, thresholds: e.target.value })} />
      </Field>
      <Field label="Verification pending alert after (days)" htmlFor="s-vp" error={errors.verification_pending_days}>
        <input id="s-vp" type="number" min={1} className="input" value={v.verification_pending_days} onChange={(e) => setV({ ...v, verification_pending_days: Number(e.target.value) })} />
      </Field>
      <Field label="Release request due in (days)" htmlFor="s-sla" error={errors.release_sla_days}>
        <input id="s-sla" type="number" min={1} className="input" value={v.release_sla_days} onChange={(e) => setV({ ...v, release_sla_days: Number(e.target.value) })} />
      </Field>
      <Field label="Maximum upload size (MB)" htmlFor="s-mb" error={errors.max_file_mb} hint="Allowed types: PDF, JPEG, PNG (checked from file contents).">
        <input id="s-mb" type="number" min={1} max={25} className="input" value={v.max_file_mb} onChange={(e) => setV({ ...v, max_file_mb: Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-2 flex justify-end"><button className="btn btn-primary" disabled={!dirty || pending}>{pending ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

export function RuleRow({ rule }: { rule: { key: string; enabled: boolean; escalate_after_days: number } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [days, setDays] = useState(rule.escalate_after_days);
  const [pending, start] = useTransition();
  const save = (en: boolean, d: number) => start(async () => {
    const r = await toggleRule(rule.key, en, d);
    if (!r.ok) { toast({ title: "Not saved", description: r.error, tone: "error" }); setEnabled(rule.enabled); return; }
    router.refresh();
  });
  return (
    <>
      <td><label className="inline-flex items-center gap-2 text-[0.82rem]"><input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => { setEnabled(e.target.checked); save(e.target.checked, days); }} />{enabled ? "On" : "Off"}</label></td>
      <td><input aria-label="Escalate after days" type="number" min={0} max={60} className="input !h-8 !w-20 mono" value={days} onChange={(e) => setDays(Number(e.target.value))} onBlur={() => days !== rule.escalate_after_days && save(enabled, days)} /></td>
    </>
  );
}

export function ResetDemo() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn btn-danger" onClick={() => setOpen(true)}>Reset demo data</button>
      <ConfirmDialog open={open} tone="danger" title="Reset all demo data?" confirmLabel="Reset and sign out" busy={pending}
        body={<><p>Deletes every record, document and audit event and reseeds the synthetic data set relative to today. Use this before a fresh demo run.</p><p>You will be signed out.</p></>}
        onCancel={() => setOpen(false)}
        onConfirm={() => start(async () => {
          const r = await resetDemoData();
          if (!r.ok) { toast({ title: "Reset failed", description: r.error, tone: "error" }); setOpen(false); return; }
          await signOut();
        })} />
    </>
  );
}


export function SchedulerForm({ initial, last }: { initial: { enabled: boolean; interval_minutes: number }; last: { at: string; trigger: string; created: number; candidates: number } | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [minutes, setMinutes] = useState(initial.interval_minutes);
  const [pending, start] = useTransition();
  const dirty = enabled !== initial.enabled || minutes !== initial.interval_minutes;
  return (
    <div className="p-4 space-y-4">
      <label className="flex items-center gap-2.5 text-[0.88rem]"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Run the alert checks automatically</label>
      <Field label="Every (minutes)" htmlFor="sch-min" hint="1 minute is handy during a live demo; 15 to 60 minutes in normal use.">
        <input id="sch-min" type="number" min={1} max={1440} className="input !w-32 mono" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
      </Field>
      <p className="text-[0.8rem] text-ink-3">
        {last ? <>Last automatic run {new Date(last.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} ({last.trigger === "cron" ? "hosted cron" : "in-app scheduler"}): {last.candidates} conditions, {last.created} new alerts.</> : "No automatic run yet. The first one starts about 10 seconds after the server starts."}
      </p>
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={!dirty || pending} onClick={() => start(async () => {
          const r = await saveScheduler(enabled, minutes);
          if (!r.ok) { toast({ title: "Not saved", description: r.error, tone: "error" }); return; }
          toast({ title: enabled ? `Automatic checks every ${minutes} min` : "Automatic checks paused" });
          router.refresh();
        })}>{pending ? "Saving…" : "Save schedule"}</button>
      </div>
    </div>
  );
}

export function ClockForm({ offset, simulatedToday, realToday }: { offset: number; simulatedToday: string; realToday: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [days, setDays] = useState(offset);
  const [pending, start] = useTransition();
  const apply = (d: number) => start(async () => {
    const r = await setSimulatedClock(d);
    if (!r.ok) { toast({ title: "Not changed", description: r.error, tone: "error" }); return; }
    setDays(d);
    toast({ title: d === 0 ? "Back to the real date" : `Simulated date moved ${d > 0 ? "forward" : "back"} ${Math.abs(d)} days`, description: "Run the checks, or wait for the scheduler, to evaluate reminders on the new date." });
    router.refresh();
  });
  return (
    <div className="p-4 space-y-4">
      <p className="text-[0.84rem] text-ink-2">Real date {realToday}. The rules currently treat today as <strong className="mono">{simulatedToday}</strong>{offset ? ` (${offset > 0 ? "+" : ""}${offset} days)` : ""}. A banner shows on every page while this is not zero.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Offset in days" htmlFor="clk"><input id="clk" type="number" min={-60} max={400} className="input !w-28 mono" value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
        <button className="btn btn-secondary" disabled={pending || days === offset} onClick={() => apply(days)}>Apply</button>
        <button className="btn btn-ghost" disabled={pending} onClick={() => apply(offset + 7)}>+7 days</button>
        <button className="btn btn-ghost" disabled={pending} onClick={() => apply(offset + 30)}>+30 days</button>
        <button className="btn btn-ghost" disabled={pending || offset === 0} onClick={() => apply(0)}>Reset to real date</button>
      </div>
    </div>
  );
}
