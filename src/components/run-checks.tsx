"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Zap, Loader2 } from "lucide-react";
import { runChecksNow } from "@/app/actions/workflow";
import { useToast } from "./toast";
import type { RunSummary } from "@/lib/alert-engine";

/** Executes the real rule engine and reports exactly what it changed. */
export function RunChecksButton({ variant = "primary", showResult = false }: { variant?: "primary" | "secondary" | "light"; showResult?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [last, setLast] = useState<RunSummary | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button className={`btn btn-${variant}`} disabled={pending} onClick={() => start(async () => {
        const r = await runChecksNow();
        if (!r.ok) { toast({ title: "Checks did not run", description: r.error, tone: "error" }); return; }
        setLast(r.summary);
        const rules = Object.entries(r.summary.byRule).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ");
        toast({
          title: r.summary.created ? `${r.summary.created} new alert${r.summary.created === 1 ? "" : "s"} created` : "No new alerts. Everything already flagged.",
          description: `${r.summary.rulesEvaluated} rules evaluated, ${r.summary.candidates} conditions found${rules ? ` (${rules})` : ""}. ${r.summary.autoResolved} auto-resolved, ${r.summary.escalated} escalated.`,
          tone: r.summary.created ? "success" : "info",
        });
        router.refresh();
      })}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {pending ? "Running checks…" : "Run checks now"}
      </button>
      {showResult && last && <span className="text-[0.72rem] text-ink-3 tabular">Last run {new Date(last.ranAt).toLocaleTimeString("en-IN")}: {last.created} created, {last.autoResolved} resolved</span>}
    </div>
  );
}
