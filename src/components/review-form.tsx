"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { reviewDocument } from "@/app/actions/workflow";
import { ConfirmDialog } from "./forms";
import { useToast } from "./toast";

type Decision = "approved" | "rejected" | "changes_requested";
const COPY: Record<Decision, { label: string; title: string; body: string }> = {
  approved: { label: "Approve", title: "Approve this document?", body: "Marks the FDR receipt as verified by manual review. The decision and your remarks are written to the audit trail and cannot be edited." },
  changes_requested: { label: "Request changes", title: "Send back for changes?", body: "The institution is asked to upload a corrected version. Your remarks are shown to them." },
  rejected: { label: "Reject", title: "Reject this document?", body: "Marks the receipt as rejected. The institution must upload a new document." },
};

/** Reviewer decision. The server re-checks the reviewer role and that the document is still pending. */
export function ReviewForm({ documentId, version }: { documentId: string; version: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [remarks, setRemarks] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const ask = (d: Decision) => {
    if (d !== "approved" && !remarks.trim()) { setError("Add remarks so the institution knows what to fix."); return; }
    setError("");
    setDecision(d);
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <label htmlFor="remarks" className="field-label">Remarks</label>
        <textarea id="remarks" className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} aria-invalid={!!error}
          placeholder="Required when rejecting or requesting changes" aria-describedby={error ? "remarks-error" : undefined} />
        {error && <p id="remarks-error" role="alert" className="field-error">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => ask("approved")} disabled={pending}><Check size={15} /> Approve</button>
        <button className="btn btn-secondary" onClick={() => ask("changes_requested")} disabled={pending}><RotateCcw size={14} /> Request changes</button>
        <button className="btn btn-ghost text-[var(--bad-ink)]" onClick={() => ask("rejected")} disabled={pending}><X size={15} /> Reject</button>
      </div>
      <p className="text-[0.74rem] text-ink-3">Reviewing version {version}. This is a manual review; the prototype does not check authenticity with the bank.</p>
      {decision && (
        <ConfirmDialog open title={COPY[decision].title} confirmLabel={COPY[decision].label} tone={decision === "rejected" ? "danger" : "primary"} busy={pending}
          body={<><p>{COPY[decision].body}</p>{remarks && <p className="text-ink-3 border-l-2 border-[var(--line-strong)] pl-2.5">{remarks}</p>}</>}
          onCancel={() => setDecision(null)}
          onConfirm={() => start(async () => {
            const r = await reviewDocument(documentId, { decision, remarks });
            setDecision(null);
            if (!r.ok) { toast({ title: "Decision not saved", description: r.error, tone: "error" }); return; }
            toast({ title: `Document ${decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "sent back for changes"}`, description: "Recorded in the audit trail." });
            setRemarks("");
            router.refresh();
          })} />
      )}
    </div>
  );
}
