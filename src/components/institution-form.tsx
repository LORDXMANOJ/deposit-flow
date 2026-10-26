"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil } from "lucide-react";
import { institutionSchema, CATEGORIES, type InstitutionInput } from "@/lib/validation";
import { saveInstitution } from "@/app/actions/records";
import { Drawer, Field, useIdempotencyKey } from "./forms";
import { useToast } from "./toast";

const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Delhi", "Gujarat", "Haryana", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

type Props = { mode: "create" } | { mode: "edit"; id: string; initial: InstitutionInput };

/** Create/edit institution. Opens from a button, or from `?new=1` (command menu). */
export function InstitutionForm(props: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [idem, renewIdem] = useIdempotencyKey();
  const defaults: InstitutionInput = props.mode === "edit" ? props.initial
    : { name: "", category: "Engineering", aicte_ref: "", state: "", district: "", contact_name: "", contact_email: "", contact_phone: "", status: "active" };
  const form = useForm<InstitutionInput>({ resolver: zodResolver(institutionSchema), defaultValues: defaults, mode: "onTouched" });
  const { register, handleSubmit, formState: { errors, isDirty }, setError, reset } = form;

  useEffect(() => {
    if (props.mode === "create" && sp.get("new") === "1") setOpen(true);
  }, [sp, props.mode]);

  const close = () => {
    setOpen(false);
    if (sp.get("new")) router.replace(pathname, { scroll: false });
  };

  const onSubmit = handleSubmit((values) => start(async () => {
    const r = await saveInstitution(props.mode === "edit" ? props.id : null, { ...values, idempotency_key: idem });
    if (!r.ok) {
      for (const [k, msg] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof InstitutionInput, { message: msg });
      toast({ title: "Not saved", description: r.error, tone: "error" });
      return;
    }
    toast({ title: props.mode === "edit" ? "Institution updated" : "Institution created", description: values.name });
    renewIdem();
    reset(values);
    setOpen(false);
    if (props.mode === "create") router.push(`/institutions/${r.id}`);
    else router.refresh();
  }));

  const err = (k: keyof InstitutionInput) => errors[k]?.message;
  const aria = (k: keyof InstitutionInput) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <>
      {props.mode === "create"
        ? <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New institution</button>
        : <button className="btn btn-secondary" onClick={() => setOpen(true)}><Pencil size={14} /> Edit</button>}
      <Drawer open={open} onClose={close} dirty={isDirty} title={props.mode === "edit" ? "Edit institution" : "New institution"}
        description="Synthetic demo data only. Do not enter real personal information."
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" form="inst-form" className="btn btn-primary" disabled={pending || !idem}>{pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Create institution"}</button>
        </>}>
        <form id="inst-form" onSubmit={onSubmit} noValidate className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Field label="Institution name" htmlFor="name" error={err("name")} className="col-span-2">
            <input id="name" className="input" autoComplete="off" {...register("name")} {...aria("name")} />
          </Field>
          <Field label="Category" htmlFor="category" error={err("category")}>
            <select id="category" className="input" {...register("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="AICTE-related identifier" htmlFor="aicte_ref" error={err("aicte_ref")} hint="Optional. Use a DEMO- value.">
            <input id="aicte_ref" className="input mono" placeholder="DEMO-AICTE-0000" {...register("aicte_ref")} {...aria("aicte_ref")} />
          </Field>
          <Field label="State" htmlFor="state" error={err("state")}>
            <input id="state" className="input" list="states" {...register("state")} {...aria("state")} />
            <datalist id="states">{STATES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="District" htmlFor="district" error={err("district")}>
            <input id="district" className="input" {...register("district")} {...aria("district")} />
          </Field>
          <Field label="Authorized contact" htmlFor="contact_name" error={err("contact_name")} className="col-span-2">
            <input id="contact_name" className="input" autoComplete="off" {...register("contact_name")} {...aria("contact_name")} />
          </Field>
          <Field label="Contact email" htmlFor="contact_email" error={err("contact_email")}>
            <input id="contact_email" type="email" className="input" placeholder="name@example.invalid" {...register("contact_email")} {...aria("contact_email")} />
          </Field>
          <Field label="Contact phone" htmlFor="contact_phone" error={err("contact_phone")}>
            <input id="contact_phone" type="tel" inputMode="tel" className="input" placeholder="+91 90000 00000" {...register("contact_phone")} {...aria("contact_phone")} />
          </Field>
          <Field label="Status" htmlFor="status" error={err("status")}>
            <select id="status" className="input" {...register("status")}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
            </select>
          </Field>
        </form>
      </Drawer>
    </>
  );
}
