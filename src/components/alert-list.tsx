"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { ChevronDown, Check, CheckCheck } from "lucide-react";
import { setAlertStatus } from "@/app/actions/workflow";
import { useToast } from "./toast";
import { StatusBadge } from "./ui";

export type AlertRow = {
  id: string; code: string; title: string; message: string; severity: string; status: string; rule: string; rule_name: string;
  assigned_role: string; created_at: string; escalation_level: number; link: string;
  actions: Array<{ id: number; action: string; actor_name: string | null; note: string | null; created_at: string }>;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * #2 Optimistic status changes (acknowledge / resolve) with rollback on error.
 * #5 Both are reversible, so they run immediately with an Undo toast instead of a confirm dialog.
 */
export function AlertList({ rows, canManage, focus }: { rows: AlertRow[]; canManage: boolean; focus?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [view, setOptimistic] = useOptimistic(rows, (cur: AlertRow[], u: { id: string; status: string }) => cur.map((r) => (r.id === u.id ? { ...r, status: u.status } : r)));

  const change = (r: AlertRow, to: "acknowledged" | "resolved") => start(async () => {
    setOptimistic({ id: r.id, status: to });
    const res = await setAlertStatus(r.id, to);
    if (!res.ok) { toast({ title: "Change rolled back", description: res.error, tone: "error" }); return; }
    router.refresh();
    toast({
      title: `${r.code} ${to}`, tone: "info",
      action: { label: "Undo", onClick: async () => { await setAlertStatus(r.id, res.previous as "open" | "acknowledged", "Undo"); router.refresh(); } },
    });
  });

  return (
    <ul className="divide-y divide-[var(--line)]">
      {view.map((r) => {
        const expanded = open === r.id;
        return (
          <li key={r.id} id={r.id} className={`${r.status === "resolved" ? "opacity-70" : ""} ${focus === r.id ? "bg-[var(--accent-soft)]" : ""}`}>
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="pt-0.5 w-[74px] shrink-0"><StatusBadge status={r.severity} /></div>
              <div className="min-w-0 flex-1">
                <Link href={r.link} className="text-[0.88rem] font-medium hover:underline underline-offset-2">{r.title}</Link>
                <p className="text-[0.8rem] text-ink-2 mt-0.5">{r.message}</p>
                <p className="text-[0.72rem] text-ink-3 mt-1">
                  <span className="mono">{r.code}</span>, {r.rule_name}, for {r.assigned_role === "finance" ? "Finance" : r.assigned_role === "verifier" ? "Verification" : r.assigned_role === "institution" ? "Institution" : "Admin"}, {when(r.created_at)}
                  {r.escalation_level > 0 && <span className="text-[var(--bad-ink)]">, escalated to Administrator</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <StatusBadge status={r.status} />
                {canManage && r.status === "open" && <button className="btn btn-ghost btn-sm hit" onClick={() => change(r, "acknowledged")} title="Acknowledge"><Check size={14} /><span className="hidden md:inline">Acknowledge</span></button>}
                {canManage && r.status !== "resolved" && <button className="btn btn-ghost btn-sm hit" onClick={() => change(r, "resolved")} title="Resolve"><CheckCheck size={14} /><span className="hidden md:inline">Resolve</span></button>}
                <button className="btn btn-ghost btn-sm btn-icon hit" aria-expanded={expanded} aria-label={`History for ${r.code}`} onClick={() => setOpen(expanded ? null : r.id)}>
                  <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            {expanded && (
              <ol className="ml-[106px] mr-4 mb-3 border-l border-[var(--line)] pl-4 space-y-1.5">
                {r.actions.map((a) => (
                  <li key={a.id} className="text-[0.76rem] text-ink-2"><span className="font-medium">{a.action.replace("_", " ")}</span> by {a.actor_name ?? "System"}, {when(a.created_at)}{a.note ? ` (${a.note})` : ""}</li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
