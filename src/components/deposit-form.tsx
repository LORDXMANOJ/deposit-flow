"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { depositSchema, DEPOSIT_TYPES, type DepositInput } from "@/lib/validation";
import { createDeposit } from "@/app/actions/records";
import { Field, useIdempotencyKey } from "./forms";
import { formatINR, isValidAmount } from "@/lib/money";
import { useToast } from "./toast";

/** Deposit + optional linked FDR, created atomically on the server. Idempotent across retries (#19). */
export function DepositForm({ institutions, defaultInstitution, today }: { institutions: Array<{ id: string; name: string }>; defaultInstitution?: string; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [idem, renewIdem] = useIdempotencyKey();
  const { register, handleSubmit, formState: { errors }, setError, watch } = useForm<DepositInput>({
    resolver: zodResolver(depositSchema),
    mode: "onTouched",
    defaultValues: { institution_id: defaultInstitution ?? (institutions.length === 1 ? institutions[0].id : ""), deposit_type: "Security Deposit",
      principal: "", deposit_date: today, bank: "", notes: "", fdr_number: "", issue_date: today, maturity_date: "" },
  });
  const principal = watch("principal");

  const onSubmit = handleSubmit((v) => start(async () => {
    const r = await createDeposit({ ...v, idempotency_key: idem });
    if (!r.ok) {
      for (const [k, msg] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof DepositInput, { message: msg });
      toast({ title: "Deposit not created", description: r.error, tone: "error" });
      return;
    }
    renewIdem();
    toast({ title: `${r.code} created`, description: v.fdr_number ? `Linked FDR ${v.fdr_number} registered. Upload its receipt next.` : "Saved as draft." });
    router.push(`/deposits/${r.id}`);
  }));
  const e = (k: keyof DepositInput) => errors[k]?.message as string | undefined;
  const a = (k: keyof DepositInput) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-[880px]">
      <section className="grid md:grid-cols-[220px_1fr] gap-x-10 gap-y-4 py-6 border-b border-[var(--line)]">
        <div><h2 className="font-semibold">Deposit</h2><p className="text-[0.8rem] text-ink-3 mt-1">What was deposited, by whom and where.</p></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Institution" htmlFor="institution_id" error={e("institution_id")} className="sm:col-span-2">
            <select id="institution_id" className="input" {...register("institution_id")} {...a("institution_id")}>
              <option value="">Select an institution</option>
              {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Deposit type" htmlFor="deposit_type" error={e("deposit_type")}>
            <select id="deposit_type" className="input" {...register("deposit_type")}>{DEPOSIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Principal amount (INR)" htmlFor="principal" error={e("principal")} hint={principal && isValidAmount(principal) ? formatINR(principal) : "Up to 2 decimal places"}>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-sm" aria-hidden>₹</span>
              <input id="principal" inputMode="decimal" className="input !pl-6 mono" placeholder="2500000.00" {...register("principal")} {...a("principal")} />
            </div>
          </Field>
          <Field label="Deposit date" htmlFor="deposit_date" error={e("deposit_date")}>
            <input id="deposit_date" type="date" max={today} className="input" {...register("deposit_date")} {...a("deposit_date")} />
          </Field>
          <Field label="Issuing bank" htmlFor="bank" error={e("bank")}>
            <input id="bank" className="input" placeholder="e.g. State Bank of Demo" {...register("bank")} {...a("bank")} />
          </Field>
          <Field label="Internal notes" htmlFor="notes" error={e("notes")} className="sm:col-span-2">
            <textarea id="notes" className="input" rows={3} {...register("notes")} />
          </Field>
        </div>
      </section>
      <section className="grid md:grid-cols-[220px_1fr] gap-x-10 gap-y-4 py-6 border-b border-[var(--line)]">
        <div><h2 className="font-semibold">Linked FDR</h2><p className="text-[0.8rem] text-ink-3 mt-1">Optional. Registering it now starts maturity monitoring.</p></div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="FDR number" htmlFor="fdr_number" error={e("fdr_number")} className="sm:col-span-3" hint="Use a fictional number, e.g. DEMO-FDR-900001">
            <input id="fdr_number" className="input mono" autoComplete="off" {...register("fdr_number")} {...a("fdr_number")} />
          </Field>
          <Field label="Issue date" htmlFor="issue_date" error={e("issue_date")}>
            <input id="issue_date" type="date" className="input" {...register("issue_date")} {...a("issue_date")} />
          </Field>
          <Field label="Maturity date" htmlFor="maturity_date" error={e("maturity_date")}>
            <input id="maturity_date" type="date" className="input" {...register("maturity_date")} {...a("maturity_date")} />
          </Field>
        </div>
      </section>
      <div className="flex items-center justify-end gap-2 py-5">
        <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !idem}>{pending ? "Creating…" : "Create deposit"}</button>
      </div>
    </form>
  );
}
