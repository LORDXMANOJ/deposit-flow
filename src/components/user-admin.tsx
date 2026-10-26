"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { createUser, updateUser } from "@/app/actions/workflow";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/rbac";
import { Drawer, Field, useIdempotencyKey } from "./forms";
import { useToast } from "./toast";

type Inst = { id: string; name: string };

/** Inline role / institution / active edits. The server blocks removing your own admin access. */
export function UserRow({ user, institutions, self }: { user: { id: string; role: Role; institution_id: string | null; active: boolean }; institutions: Inst[]; self: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [inst, setInst] = useState(user.institution_id ?? "");
  const [active, setActive] = useState(user.active);
  const [pending, start] = useTransition();
  const dirty = role !== user.role || (inst || null) !== user.institution_id || active !== user.active;

  return (
    <>
      <td>
        <select aria-label="Role" className="input !h-8 !w-[200px] text-[0.82rem]" value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </td>
      <td>
        {role === "institution" ? (
          <select aria-label="Institution" className="input !h-8 !w-[220px] text-[0.82rem]" value={inst} onChange={(e) => setInst(e.target.value)}>
            <option value="">Select</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        ) : <span className="text-ink-3 text-[0.8rem]">All institutions</span>}
      </td>
      <td>
        <label className="inline-flex items-center gap-2 text-[0.82rem]">
          <input type="checkbox" checked={active} disabled={self} onChange={(e) => setActive(e.target.checked)} /> {active ? "Active" : "Disabled"}
        </label>
      </td>
      <td className="text-right">
        <button className="btn btn-secondary btn-sm" disabled={!dirty || pending} onClick={() => start(async () => {
          const r = await updateUser(user.id, role, inst || null, active);
          if (!r.ok) { toast({ title: "Not saved", description: r.error, tone: "error" }); return; }
          toast({ title: "User updated", description: "Role change recorded in the audit trail." });
          router.refresh();
        })}>{pending ? "Saving…" : "Save"}</button>
      </td>
    </>
  );
}

export function NewUser({ institutions }: { institutions: Inst[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ email: "", full_name: "", role: "verifier" as Role, institution_id: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [idem, renewIdem] = useIdempotencyKey();
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><UserPlus size={15} /> New user</button>
      <Drawer open={open} onClose={() => setOpen(false)} dirty={!!v.email} title="New demo user" description="Demo accounts sign in from the role picker. No passwords are created."
        footer={<>
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="user-form" disabled={pending || !idem}>{pending ? "Creating…" : "Create user"}</button>
        </>}>
        <form id="user-form" noValidate className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createUser({ ...v, institution_id: v.institution_id || null, idempotency_key: idem });
            if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast({ title: "User not created", description: r.error, tone: "error" }); return; }
            renewIdem();
            setOpen(false);
            setV({ email: "", full_name: "", role: "verifier", institution_id: "" });
            toast({ title: "User created", description: v.full_name });
            router.refresh();
          });
        }}>
          <Field label="Full name" htmlFor="u-name" error={errors.full_name}><input id="u-name" className="input" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="u-email" error={errors.email}><input id="u-email" type="email" className="input" placeholder="name@demo.depositflow" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="u-role"><select id="u-role" className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          {v.role === "institution" && (
            <Field label="Institution" htmlFor="u-inst" error={errors.institution_id}><select id="u-inst" className="input" value={v.institution_id} onChange={(e) => setV({ ...v, institution_id: e.target.value })}><option value="">Select</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          )}
        </form>
      </Drawer>
    </>
  );
}
