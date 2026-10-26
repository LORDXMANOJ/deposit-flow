"use server";

import { revalidatePath } from "next/cache";
import { one, q, tx } from "@/lib/db";
import { assertInstitutionAccess, authorize, toActor } from "@/lib/auth";
import { audit, workflowEvent } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/action-result";
import { withIdempotency } from "@/lib/idempotency";
import { depositSchema, institutionSchema } from "@/lib/validation";
import { isScoped } from "@/lib/rbac";

/* ---------------- Institutions ---------------- */

export async function saveInstitution(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const u = await authorize("institution.write");
    const v = institutionSchema.parse(input);
    const actor = toActor(u);
    const res = await withIdempotency(id ? undefined : v.idempotency_key, "institution.create", async () =>
      tx(async (t) => {
        const fields = [v.name, v.category, v.aicte_ref || null, v.state, v.district, v.contact_name, v.contact_email, v.contact_phone, v.status];
        if (id) {
          const before = await one<Record<string, unknown>>("select * from institutions where id=$1", [id], t);
          if (!before) throw new Error("Institution not found.");
          await q(`update institutions set name=$1, category=$2, aicte_ref=$3, state=$4, district=$5, contact_name=$6, contact_email=$7,
                   contact_phone=$8, status=$9, updated_at=now() where id=$10`, [...fields, id], t);
          const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => k !== "idempotency_key" && (before[k] ?? "") !== (val ?? ""))
            .map(([k, val]) => [k, { from: before[k], to: val }]));
          await audit(actor, "institution.updated", "institution", id, v.name, { changes: changed }, t);
          return { id };
        }
        const row = await one<{ id: string; code: string }>(
          `insert into institutions (name, category, aicte_ref, state, district, contact_name, contact_email, contact_phone, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, code`, fields, t);
        await audit(actor, "institution.created", "institution", row!.id, v.name, { code: row!.code }, t);
        return { id: row!.id };
      }));
    revalidatePath("/institutions");
    return { ok: true, id: res.id };
  } catch (e) {
    return fail(e);
  }
}

/** Archive/restore is reversible, so the UI does it immediately with an Undo toast instead of a confirm dialog. */
export async function setInstitutionStatus(id: string, status: "active" | "inactive"): Promise<ActionResult> {
  try {
    const u = await authorize("institution.write");
    const before = await one<{ status: string; name: string }>("select status, name from institutions where id=$1", [id]);
    if (!before) throw new Error("Institution not found.");
    await q("update institutions set status=$1, updated_at=now() where id=$2", [status, id]);
    await audit(toActor(u), status === "inactive" ? "institution.archived" : "institution.restored", "institution", id, before.name,
      { from: before.status, to: status });
    revalidatePath("/institutions");
    revalidatePath(`/institutions/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInstitution(id: string): Promise<ActionResult> {
  try {
    const u = await authorize("institution.write");
    const inst = await one<{ name: string }>("select name from institutions where id=$1", [id]);
    if (!inst) throw new Error("Institution not found.");
    const links = await one<{ n: number }>(
      `select (select count(*) from deposits where institution_id=$1)::int + (select count(*) from fdr_records where institution_id=$1)::int as n`, [id]);
    if (links!.n > 0) throw new Error(`Cannot delete: ${links!.n} deposit/FDR records are linked. Archive the institution instead.`);
    await tx(async (t) => {
      await q("update profiles set institution_id=null, active=false where institution_id=$1", [id], t);
      await q("delete from institutions where id=$1", [id], t);
      await audit(toActor(u), "institution.deleted", "institution", id, inst.name, {}, t);
    });
    revalidatePath("/institutions");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Deposits + FDRs ---------------- */

export async function createDeposit(input: unknown): Promise<ActionResult<{ id: string; code: string; replayed?: boolean }>> {
  try {
    const u = await authorize("deposit.write");
    const v = depositSchema.parse(input);
    assertInstitutionAccess(u, v.institution_id);
    const actor = toActor(u);
    const res = await withIdempotency(v.idempotency_key, "deposit.create", async () =>
      tx(async (t) => {
        const dep = await one<{ id: string; code: string }>(
          `insert into deposits (institution_id, deposit_type, principal, deposit_date, bank, notes, status, created_by)
           values ($1,$2,$3,$4,$5,$6,'draft',$7) returning id, code`,
          [v.institution_id, v.deposit_type, v.principal, v.deposit_date, v.bank, v.notes || null, u.id], t);
        await workflowEvent("deposit", dep!.id, null, "draft", actor, "Created", t);
        let fdrCode: string | null = null;
        if (v.fdr_number) {
          const f = await one<{ id: string; code: string }>(
            `insert into fdr_records (deposit_id, institution_id, fdr_number, bank, principal, issue_date, maturity_date)
             values ($1,$2,$3,$4,$5,$6,$7) returning id, code`,
            [dep!.id, v.institution_id, v.fdr_number, v.bank, v.principal, v.issue_date, v.maturity_date], t);
          fdrCode = f!.code;
          await workflowEvent("fdr", f!.id, null, "active", actor, "Registered with deposit", t);
        }
        await audit(actor, "deposit.created", "deposit", dep!.id, dep!.code,
          { principal: v.principal, type: v.deposit_type, fdr: fdrCode }, t);
        return { id: dep!.id, code: dep!.code };
      }));
    revalidatePath("/deposits");
    revalidatePath("/");
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDepositNotes(id: string, notes: string): Promise<ActionResult> {
  try {
    const u = await authorize("deposit.write");
    const d = await one<{ institution_id: string; code: string; notes: string | null }>("select institution_id, code, notes from deposits where id=$1", [id]);
    if (!d) throw new Error("Deposit not found.");
    assertInstitutionAccess(u, d.institution_id);
    await q("update deposits set notes=$1, updated_at=now() where id=$2", [notes.slice(0, 1000), id]);
    await audit(toActor(u), "deposit.notes_updated", "deposit", id, d.code, { from: d.notes, to: notes.slice(0, 1000) });
    revalidatePath(`/deposits/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Renewal never overwrites history: a new FDR row is created and linked to the previous one. */
export async function startRenewal(fdrId: string, input: { fdr_number: string; issue_date: string; maturity_date: string; principal: string; idempotency_key?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const u = await authorize("renewal.manage");
    const prev = await one<{ id: string; deposit_id: string; institution_id: string; bank: string; fdr_number: string; lifecycle_status: string; renewal_status: string }>(
      "select id, deposit_id, institution_id, bank, fdr_number, lifecycle_status, renewal_status from fdr_records where id=$1", [fdrId]);
    if (!prev) throw new Error("FDR not found.");
    assertInstitutionAccess(u, prev.institution_id);
    if (["renewed", "released", "closed"].includes(prev.lifecycle_status)) throw new Error("This FDR is already closed.");
    if (!input.fdr_number?.trim()) throw new Error("Enter the new FDR number.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.maturity_date) || input.maturity_date <= input.issue_date)
      throw new Error("Enter a valid issue date and a later maturity date.");
    const { isValidAmount } = await import("@/lib/money");
    if (!isValidAmount(input.principal)) throw new Error("Enter a valid principal amount.");
    const actor = toActor(u);
    const res = await withIdempotency(input.idempotency_key, "fdr.renew", async () =>
      tx(async (t) => {
        const f = await one<{ id: string; code: string }>(
          `insert into fdr_records (deposit_id, institution_id, fdr_number, bank, principal, issue_date, maturity_date, renewal_status, previous_fdr_id)
           values ($1,$2,$3,$4,$5,$6,$7,'submitted',$8) returning id, code`,
          [prev.deposit_id, prev.institution_id, input.fdr_number.trim(), prev.bank, input.principal, input.issue_date, input.maturity_date, prev.id], t);
        await q("update fdr_records set renewal_status='initiated', updated_at=now() where id=$1", [prev.id], t);
        await q("update deposits set renewal_status='submitted', updated_at=now() where id=$1", [prev.deposit_id], t);
        await workflowEvent("fdr", prev.id, prev.renewal_status, "initiated", actor, `Renewal started, new FDR ${input.fdr_number}`, t);
        await workflowEvent("fdr", f!.id, null, "submitted", actor, `Renewal of ${prev.fdr_number}`, t);
        await audit(actor, "fdr.renewal_started", "fdr", f!.id, f!.code, { previous: prev.fdr_number, new: input.fdr_number }, t);
        return { id: f!.id };
      }));
    revalidatePath("/fdrs");
    return { ok: true, id: res.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setRemarks(fdrId: string, remarks: string): Promise<ActionResult> {
  try {
    const u = await authorize("fdr.write");
    const f = await one<{ institution_id: string; code: string }>("select institution_id, code from fdr_records where id=$1", [fdrId]);
    if (!f) throw new Error("FDR not found.");
    if (isScoped(u.role)) assertInstitutionAccess(u, f.institution_id);
    await q("update fdr_records set remarks=$1, updated_at=now() where id=$2", [remarks.slice(0, 1000), fdrId]);
    await audit(toActor(u), "fdr.remarks_updated", "fdr", fdrId, f.code, {});
    revalidatePath(`/fdrs/${fdrId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
