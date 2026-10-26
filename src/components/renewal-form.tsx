"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { startRenewal } from "@/app/actions/records";
import { Drawer, Field, useIdempotencyKey } from "./forms";
import { useToast } from "./toast";
import { isValidAmount } from "@/lib/money";

/** Renewal creates a NEW FDR linked to this one. The current FDR and its history are never overwritten. */
export function RenewalForm({ fdrId, fdrNumber, principal, maturity }: { fdrId: string; fdrNumber: string; principal: string; maturity: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ fdr_number: "", issue_date: maturity, maturity_date: "", principal });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [idem, renewIdem] = useIdempotencyKey();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.fdr_number.trim()) errs.fdr_number = "Enter the new FDR number";
    if (!v.maturity_date) errs.maturity_date = "Enter the new maturity date";
    else if (v.maturity_date <= v.issue_date) errs.maturity_date = "Must be after the issue date";
    if (!isValidAmount(v.principal)) errs.principal = "Enter a valid amount";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    start(async () => {
      const r = await startRenewal(fdrId, { ...v, idempotency_key: idem });
      if (!r.ok) { toast({ title: "Renewal not started", description: r.error, tone: "error" }); return; }
      renewIdem();
      setOpen(false);
      toast({ title: "Renewal started", description: `New FDR ${v.fdr_number} created. Upload its receipt for verification.` });
      router.push(`/fdrs/${r.id}`);
    });
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}><RefreshCw size={14} /> Start renewal</button>
      <Drawer open={open} onClose={() => setOpen(false)} dirty={!!v.fdr_number} title={`Renew ${fdrNumber}`}
        description="Creates a new FDR linked to this one. This FDR stays on record and is marked renewed once the new receipt is verified."
        footer={<>
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="renew-form" disabled={pending || !idem}>{pending ? "Creating…" : "Create renewal FDR"}</button>
        </>}>
        <form id="renew-form" onSubmit={submit} noValidate className="space-y-4">
          <Field label="New FDR number" htmlFor="r-no" error={errors.fdr_number}><input id="r-no" className="input mono" value={v.fdr_number} onChange={set("fdr_number")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" htmlFor="r-issue"><input id="r-issue" type="date" className="input" value={v.issue_date} onChange={set("issue_date")} /></Field>
            <Field label="Maturity date" htmlFor="r-mat" error={errors.maturity_date}><input id="r-mat" type="date" className="input" value={v.maturity_date} onChange={set("maturity_date")} /></Field>
          </div>
          <Field label="Principal (INR)" htmlFor="r-amt" error={errors.principal}><input id="r-amt" inputMode="decimal" className="input mono" value={v.principal} onChange={set("principal")} /></Field>
        </form>
      </Drawer>
    </>
  );
}
