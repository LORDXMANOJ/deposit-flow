"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import { createRelease } from "@/app/actions/workflow";
import { Drawer, Field, useIdempotencyKey } from "./forms";
import { useToast } from "./toast";

type Option = { id: string; label: string };

/** Starts a release/refund request. Server re-validates eligibility (verified deposit, no open request). */
export function ReleaseRequestButton({ depositId, options, variant = "primary", openOnParam }: { depositId?: string; options?: Option[]; variant?: "primary" | "secondary"; openOnParam?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dep, setDep] = useState(depositId ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [idem, renewIdem] = useIdempotencyKey();

  useEffect(() => { if (openOnParam && sp.get("new") === "1") setOpen(true); }, [sp, openOnParam]);
  const close = () => { setOpen(false); if (sp.get("new")) router.replace(pathname, { scroll: false }); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!dep) errs.deposit_id = "Select a deposit";
    if (reason.trim().length < 10) errs.reason = "Describe the reason (at least 10 characters)";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    start(async () => {
      const r = await createRelease({ deposit_id: dep, reason, idempotency_key: idem });
      if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast({ title: "Request not created", description: r.error, tone: "error" }); return; }
      renewIdem();
      setReason("");
      setOpen(false);
      toast({ title: `${r.code} submitted`, description: "It is now in the release review queue." });
      router.push(`/releases?open=${r.id}`);
    });
  };

  return (
    <>
      <button className={`btn btn-${variant}`} onClick={() => setOpen(true)}><ArrowRightLeft size={15} /> Request release</button>
      <Drawer open={open} onClose={close} dirty={reason.length > 0} title="Request release or refund"
        description="Goes to the configured review queue. Approval and the recorded outcome are separate steps."
        footer={<>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" form="rel-form" type="submit" disabled={pending || !idem}>{pending ? "Submitting…" : "Submit request"}</button>
        </>}>
        <form id="rel-form" onSubmit={submit} noValidate className="space-y-4">
          {!depositId && (
            <Field label="Deposit" htmlFor="deposit_id" error={errors.deposit_id} hint="Only verified deposits without an open request are listed.">
              <select id="deposit_id" className="input" value={dep} onChange={(e) => setDep(e.target.value)} aria-invalid={!!errors.deposit_id}>
                <option value="">Select a deposit</option>
                {(options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Reason" htmlFor="reason" error={errors.reason} hint="For example: programme closed, contract completed, deposit no longer required.">
            <textarea id="reason" className="input" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} />
          </Field>
          <p className="text-[0.78rem] text-ink-3 border-l-2 border-[var(--line-strong)] pl-3">
            Submitting does not move any money. A finance officer records the outcome later, either as a simulated result or with a bank reference.
          </p>
        </form>
      </Drawer>
    </>
  );
}
