"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { transitionRelease } from "@/app/actions/workflow";
import { ConfirmDialog } from "./forms";
import { useToast } from "./toast";

type Action = { to: string; label: string; tone?: "primary" | "danger" | "secondary"; needsComment?: boolean; outcome?: boolean; explain: string };

/** Buttons are only shown for transitions this role may perform; the server enforces the same rules. */
export function ReleaseActions({ id, code, actions }: { id: string; code: string; actions: Action[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = useState<Action | null>(null);
  const [comment, setComment] = useState("");
  const [outcome, setOutcome] = useState("");
  const [simulated, setSimulated] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!actions.length) return null;

  const confirm = () => {
    if (!active) return;
    if (active.needsComment && !comment.trim()) { setError("A comment is required for this decision."); return; }
    if (active.outcome && !simulated && !outcome.trim()) { setError("Enter the bank or office reference, or mark the outcome as simulated."); return; }
    start(async () => {
      const r = await transitionRelease(id, active.to, comment, active.outcome ? (simulated ? "SIMULATED" : outcome) : undefined);
      if (!r.ok) { setError(r.error); toast({ title: "Not updated", description: r.error, tone: "error" }); return; }
      toast({ title: `${code}: ${active.label.toLowerCase()}`, description: active.outcome ? (simulated ? "Recorded as a simulated outcome. No funds were moved by this app." : "Manual confirmation recorded.") : "Recorded in the workflow history." });
      setActive(null); setComment(""); setOutcome(""); setError("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.to} onClick={() => { setActive(a); setError(""); }} className={`btn ${a.tone === "danger" ? "btn-ghost text-[var(--bad-ink)]" : a.tone === "secondary" ? "btn-secondary" : "btn-primary"}`}>{a.label}</button>
        ))}
      </div>
      {active && (
        <ConfirmDialog open title={`${active.label}: ${code}`} confirmLabel={active.label} tone={active.tone === "danger" ? "danger" : "primary"} busy={pending}
          body={<p>{active.explain}</p>} onCancel={() => setActive(null)} onConfirm={confirm}>
          <div className="space-y-3">
            {active.outcome && (
              <fieldset className="space-y-2">
                <legend className="field-label">Outcome</legend>
                <label className="flex items-start gap-2 text-[0.84rem]"><input type="radio" name="mode" checked={simulated} onChange={() => setSimulated(true)} className="mt-1" />
                  <span><strong>Simulated</strong> <span className="text-ink-3">(demo). Records SIM-{code}; no money moves.</span></span></label>
                <label className="flex items-start gap-2 text-[0.84rem]"><input type="radio" name="mode" checked={!simulated} onChange={() => setSimulated(false)} className="mt-1" />
                  <span><strong>Manual confirmation</strong> <span className="text-ink-3">with a reference from the bank or accounts office.</span></span></label>
                {!simulated && <input className="input mono" aria-label="Outcome reference" placeholder="e.g. BANK-ADV-2026-0412" value={outcome} onChange={(e) => setOutcome(e.target.value)} />}
              </fieldset>
            )}
            <div>
              <label htmlFor="rel-comment" className="field-label">Comment{active.needsComment ? "" : " (optional)"}</label>
              <textarea id="rel-comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            {error && <p role="alert" className="field-error">{error}</p>}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
