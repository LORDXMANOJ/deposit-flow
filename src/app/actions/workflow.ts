"use server";

import { revalidatePath } from "next/cache";
import { one, q, tx, resetDemo } from "@/lib/db";
import { assertInstitutionAccess, authorize, getUser, toActor } from "@/lib/auth";
import { audit, workflowEvent } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/action-result";
import { withIdempotency } from "@/lib/idempotency";
import { releaseSchema, reviewSchema, settingsSchema } from "@/lib/validation";
import { ALLOWED_TYPES, saveFile, sha256, sniffMime } from "@/lib/storage";
import { runChecks, getSetting, type RunSummary } from "@/lib/alert-engine";
import { isValidAmount } from "@/lib/money";
import { addDaysISO, todayISO } from "@/lib/maturity";
import { ROLES, assertCan, type Role } from "@/lib/rbac";

const revalidateAll = () => {
  for (const p of ["/", "/deposits", "/fdrs", "/verification", "/releases", "/alerts", "/calendar", "/audit"]) revalidatePath(p);
};

/* ---------------- Documents ---------------- */

export async function uploadDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const u = await authorize("document.upload");
    const fdrId = String(formData.get("fdr_id") ?? "");
    const docType = String(formData.get("doc_type") ?? "fdr_receipt");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload.", fieldErrors: { file: "Required" } };
    const maxMb = await getSetting<number>("max_file_mb", 5);
    if (file.size > maxMb * 1024 * 1024) return { ok: false, error: `File is larger than ${maxMb} MB.`, fieldErrors: { file: `Max ${maxMb} MB` } };
    const buf = Buffer.from(await file.arrayBuffer());
    const allowed = await getSetting<string[]>("allowed_mime", Object.keys(ALLOWED_TYPES));
    const mime = sniffMime(buf); // decided from content, not from the filename or browser
    if (!mime || !allowed.includes(mime))
      return { ok: false, error: "Only PDF, JPEG or PNG files are accepted (checked from the file contents).", fieldErrors: { file: "Unsupported type" } };
    if (!["fdr_receipt", "bank_document", "supporting"].includes(docType)) throw new Error("Unknown document type.");

    const fdr = await one<{ id: string; institution_id: string; deposit_id: string; fdr_number: string; renewal_status: string }>(
      "select id, institution_id, deposit_id, fdr_number, renewal_status from fdr_records where id=$1", [fdrId]);
    if (!fdr) throw new Error("FDR not found.");
    assertInstitutionAccess(u, fdr.institution_id);

    const declaredAmount = String(formData.get("declared_amount") ?? "").trim();
    if (declaredAmount && !isValidAmount(declaredAmount)) return { ok: false, error: "Declared amount is not a valid number.", fieldErrors: { declared_amount: "Invalid" } };
    const declaredMaturity = String(formData.get("declared_maturity") ?? "").trim();
    const declaredNo = String(formData.get("declared_fdr_number") ?? "").trim();

    const key = saveFile(buf, ALLOWED_TYPES[mime].ext);
    const actor = toActor(u);
    const id = await tx(async (t) => {
      const existing = await one<{ id: string; current_version: number }>(
        "select id, current_version from documents where fdr_id=$1 and doc_type=$2 order by created_at desc limit 1", [fdrId, docType], t);
      let docId: string;
      let version = 1;
      if (existing) {
        docId = existing.id;
        version = existing.current_version + 1;
        await q("update documents set current_version=$1, status='pending_review', updated_at=now() where id=$2", [version, docId], t);
      } else {
        const d = await one<{ id: string }>(
          `insert into documents (institution_id, deposit_id, fdr_id, doc_type, title, status, uploaded_by)
           values ($1,$2,$3,$4,$5,'pending_review',$6) returning id`,
          [fdr.institution_id, fdr.deposit_id, fdrId, docType, `${docType === "fdr_receipt" ? "FDR receipt" : "Document"} ${fdr.fdr_number}`, u.id], t);
        docId = d!.id;
      }
      await q(
        `insert into document_versions (document_id, version, storage_key, original_name, mime, size_bytes, sha256,
           declared_fdr_number, declared_amount, declared_maturity, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [docId, version, key, file.name.slice(0, 120), mime, buf.length, sha256(buf), declaredNo || null, declaredAmount || null,
          /^\d{4}-\d{2}-\d{2}$/.test(declaredMaturity) ? declaredMaturity : null, u.id], t);
      if (docType === "fdr_receipt") {
        await q("update fdr_records set verification_status='pending', updated_at=now() where id=$1", [fdrId], t);
        if (["submitted", "rejected"].includes(fdr.renewal_status))
          await q("update fdr_records set renewal_status='under_review' where id=$1", [fdrId], t);
        await q(`update deposits set verification_status='pending', status = case when status in ('draft','action_required','submitted') then 'under_review' else status end,
                 updated_at=now() where id=$1`, [fdr.deposit_id], t);
      }
      await workflowEvent("document", docId, null, "pending_review", actor, `Version ${version} uploaded`, t);
      await audit(actor, version > 1 ? "document.replaced" : "document.uploaded", "document", docId, file.name.slice(0, 120),
        { version, mime, size: buf.length, sha256: sha256(buf).slice(0, 16) }, t);
      return docId;
    });
    revalidateAll();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewDocument(documentId: string, input: unknown): Promise<ActionResult> {
  try {
    const u = await authorize("document.review");
    const v = reviewSchema.parse(input);
    const actor = toActor(u);
    await tx(async (t) => {
      const d = await one<{ id: string; status: string; current_version: number; fdr_id: string | null; deposit_id: string | null; title: string; doc_type: string }>(
        "select id, status, current_version, fdr_id, deposit_id, title, doc_type from documents where id=$1 for update", [documentId], t);
      if (!d) throw new Error("Document not found.");
      if (d.status !== "pending_review") throw new Error("Only documents awaiting review can be decided.");
      await q("insert into verification_reviews (document_id, version, reviewer_id, decision, remarks, mode) values ($1,$2,$3,$4,$5,'manual')",
        [documentId, d.current_version, u.id, v.decision, v.remarks || null], t);
      await q("update documents set status=$1, updated_at=now() where id=$2", [v.decision, documentId], t);
      if (d.fdr_id && d.doc_type === "fdr_receipt") {
        await q("update fdr_records set verification_status=$1, updated_at=now() where id=$2", [v.decision, d.fdr_id], t);
        const f = await one<{ previous_fdr_id: string | null; renewal_status: string }>("select previous_fdr_id, renewal_status from fdr_records where id=$1", [d.fdr_id], t);
        if (f?.previous_fdr_id) {
          // Renewal FDR outcome
          const rs = v.decision === "approved" ? "verified" : "rejected";
          await q("update fdr_records set renewal_status=$1 where id=$2", [rs, d.fdr_id], t);
          if (v.decision === "approved") {
            await q("update fdr_records set lifecycle_status='renewed', renewal_status='verified', updated_at=now() where id=$1", [f.previous_fdr_id], t);
            await workflowEvent("fdr", f.previous_fdr_id, "active", "renewed", actor, "Superseded by verified renewal", t);
          }
          if (d.deposit_id) await q("update deposits set renewal_status=$1 where id=$2", [rs, d.deposit_id], t);
        }
      }
      if (d.deposit_id) {
        const depStatus = v.decision === "approved" ? "verified" : v.decision === "rejected" ? "rejected" : "action_required";
        const before = await one<{ status: string }>("select status from deposits where id=$1", [d.deposit_id], t);
        if (before && !["release_requested", "released", "matured"].includes(before.status)) {
          await q("update deposits set verification_status=$1, status=$2, updated_at=now() where id=$3", [v.decision, depStatus, d.deposit_id], t);
          await workflowEvent("deposit", d.deposit_id, before.status, depStatus, actor, `Document ${v.decision.replace("_", " ")}`, t);
        } else {
          await q("update deposits set verification_status=$1, updated_at=now() where id=$2", [v.decision, d.deposit_id], t);
        }
      }
      await workflowEvent("document", documentId, d.status, v.decision, actor, v.remarks || null, t);
      await audit(actor, `document.${v.decision}`, "document", documentId, d.title, { version: d.current_version, remarks: v.remarks || null }, t);
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Release / refund ---------------- */

export async function createRelease(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const u = await authorize("release.create");
    const v = releaseSchema.parse(input);
    const dep = await one<{ id: string; code: string; institution_id: string; status: string; verification_status: string }>(
      "select id, code, institution_id, status, verification_status from deposits where id=$1", [v.deposit_id]);
    if (!dep) throw new Error("Deposit not found.");
    assertInstitutionAccess(u, dep.institution_id);
    if (["release_requested", "released"].includes(dep.status)) throw new Error("A release is already requested or completed for this deposit.");
    if (dep.verification_status !== "approved")
      throw new Error("The deposit's FDR document must be verified before a release can be requested.");
    const fdr = await one<{ id: string }>("select id from fdr_records where deposit_id=$1 and lifecycle_status not in ('renewed','released','closed') order by created_at desc limit 1", [dep.id]);
    const sla = await getSetting<number>("release_sla_days", 7);
    const actor = toActor(u);
    const res = await withIdempotency(v.idempotency_key, "release.create", async () =>
      tx(async (t) => {
        const r = await one<{ id: string; code: string }>(
          `insert into release_requests (deposit_id, fdr_id, institution_id, requested_by, reason, due_date)
           values ($1,$2,$3,$4,$5,$6) returning id, code`,
          [dep.id, fdr?.id ?? null, dep.institution_id, u.id, v.reason, addDaysISO(todayISO(), sla)], t);
        await q("update deposits set status='release_requested', release_status='requested', updated_at=now() where id=$1", [dep.id], t);
        await workflowEvent("deposit", dep.id, dep.status, "release_requested", actor, r!.code, t);
        await workflowEvent("release", r!.id, null, "submitted", actor, v.reason, t);
        await audit(actor, "release.created", "release", r!.id, r!.code, { deposit: dep.code }, t);
        return { id: r!.id, code: r!.code };
      }));
    revalidateAll();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/** Allowed transitions (configurable demonstration workflow, not an AICTE-mandated hierarchy). */
const RELEASE_TRANSITIONS: Record<string, { to: string[]; perm: "release.review" | "release.process" }> = {
  submitted: { to: ["under_review"], perm: "release.review" },
  under_review: { to: ["approved", "rejected", "info_requested"], perm: "release.review" },
  info_requested: { to: ["under_review"], perm: "release.review" },
  approved: { to: ["released"], perm: "release.process" },
};

export async function transitionRelease(id: string, to: string, comment: string, outcomeRef?: string): Promise<ActionResult> {
  try {
    const u0 = await getUser();
    if (!u0) throw new Error("You are signed out.");
    const actor = toActor(u0);
    await tx(async (t) => {
      const r = await one<{ id: string; code: string; status: string; deposit_id: string; fdr_id: string | null; institution_id: string; requested_by: string | null }>(
        "select id, code, status, deposit_id, fdr_id, institution_id, requested_by from release_requests where id=$1 for update", [id], t);
      if (!r) throw new Error("Request not found.");
      const rule = RELEASE_TRANSITIONS[r.status];
      // Institution users may respond to an info request on their own request.
      const isOwnerResponse = r.status === "info_requested" && to === "under_review" && u0.role === "institution";
      if (isOwnerResponse) assertInstitutionAccess(u0, r.institution_id);
      else {
        if (!rule || !rule.to.includes(to)) throw new Error(`A request in "${r.status.replace("_", " ")}" cannot move to "${to.replace("_", " ")}".`);
        // Pure check (no query): PGlite has one connection, so nothing may query outside `t` here.
        assertCan(u0.role, rule.perm);
      }
      if (["rejected", "info_requested"].includes(to) && !comment.trim()) throw new Error("Add a comment explaining the decision.");
      if (to === "released" && !outcomeRef?.trim()) throw new Error("Enter the outcome reference (e.g. bank advice number) or mark it as simulated.");
      if (u0.id === r.requested_by && ["approved", "released"].includes(to)) throw new Error("The requester cannot approve or process their own request.");

      const sets: string[] = ["status=$1", "updated_at=now()"];
      const params: unknown[] = [to];
      if (["approved", "rejected", "info_requested"].includes(to)) {
        params.push(u0.id, comment || null);
        sets.push(`reviewer_id=$${params.length - 1}`, `reviewer_comments=$${params.length}`, "decided_at=now()");
      }
      if (to === "released") {
        const simulated = outcomeRef!.trim().toUpperCase() === "SIMULATED";
        params.push(simulated ? `SIM-${r.code}` : outcomeRef!.trim(), simulated ? "simulated" : "manual_confirmation", u0.id);
        sets.push(`outcome_ref=$${params.length - 2}`, `outcome_mode=$${params.length - 1}`, `processed_by=$${params.length}`, "processed_at=now()");
      }
      params.push(id);
      await q(`update release_requests set ${sets.join(", ")} where id=$${params.length}`, params, t);

      if (to === "released") {
        await q("update deposits set status='released', release_status='released', updated_at=now() where id=$1", [r.deposit_id], t);
        if (r.fdr_id) await q("update fdr_records set lifecycle_status='released', updated_at=now() where id=$1", [r.fdr_id], t);
        await workflowEvent("deposit", r.deposit_id, "release_requested", "released", actor, `Outcome recorded (${r.code})`, t);
      }
      if (to === "approved") await q("update deposits set release_status='approved' where id=$1", [r.deposit_id], t);
      if (to === "rejected") {
        await q("update deposits set status='verified', release_status='rejected', updated_at=now() where id=$1", [r.deposit_id], t);
        await workflowEvent("deposit", r.deposit_id, "release_requested", "verified", actor, `Release rejected (${r.code})`, t);
      }
      await workflowEvent("release", id, r.status, to, actor, comment || null, t);
      await audit(actor, `release.${to}`, "release", id, r.code, { from: r.status, comment: comment || null, outcome: outcomeRef ?? null }, t);
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Alerts & notifications ---------------- */

export async function runChecksNow(): Promise<ActionResult<{ summary: RunSummary }>> {
  try {
    const u = await authorize("alert.run");
    const summary = await runChecks(toActor(u));
    revalidateAll();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}

export async function setAlertStatus(id: string, status: "open" | "acknowledged" | "resolved", note = ""): Promise<ActionResult<{ previous: string }>> {
  try {
    const u = await authorize("alert.manage");
    const a = await one<{ status: string; code: string }>("select status, code from alerts where id=$1", [id]);
    if (!a) throw new Error("Alert not found.");
    await tx(async (t) => {
      await q(`update alerts set status=$1,
               acknowledged_at = case when $1='acknowledged' then now() when $1='open' then null else acknowledged_at end,
               resolved_at = case when $1='resolved' then now() else null end where id=$2`, [status, id], t);
      const action = status === "open" ? (a.status === "resolved" ? "reopened" : "undo") : status;
      await q("insert into alert_actions (alert_id, action, actor_id, actor_name, note) values ($1,$2,$3,$4,$5)", [id, action, u.id, u.name, note || null], t);
      await audit(toActor(u), `alert.${action}`, "alert", id, a.code, { from: a.status, to: status }, t);
    });
    revalidatePath("/alerts");
    revalidatePath("/");
    return { ok: true, previous: a.status };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationRead(id: string | "all", read = true): Promise<ActionResult> {
  try {
    const u = await getUser();
    if (!u) throw new Error("You are signed out.");
    if (id === "all") await q("update notification_events set read_at=now() where user_id=$1 and read_at is null", [u.id]);
    else await q("update notification_events set read_at = case when $3 then now() else null end where id=$1 and user_id=$2", [id, u.id, read]);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Users & settings ---------------- */

export async function updateUser(id: string, role: string, institutionId: string | null, active: boolean): Promise<ActionResult> {
  try {
    const u = await authorize("user.manage");
    if (!ROLES.includes(role as Role)) throw new Error("Unknown role.");
    if (role === "institution" && !institutionId) throw new Error("Institution users must be linked to an institution.");
    if (id === u.id && (role !== "admin" || !active)) throw new Error("You cannot remove your own administrator access.");
    const before = await one<{ role: string; active: boolean; full_name: string; institution_id: string | null }>(
      "select role, active, full_name, institution_id from profiles where id=$1", [id]);
    if (!before) throw new Error("User not found.");
    await q("update profiles set role=$1, institution_id=$2, active=$3, updated_at=now() where id=$4",
      [role, role === "institution" ? institutionId : null, active, id]);
    await audit(toActor(u), "user.updated", "profile", id, before.full_name,
      { role: { from: before.role, to: role }, active: { from: before.active, to: active } });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createUser(input: { email: string; full_name: string; role: string; institution_id: string | null; idempotency_key?: string }): Promise<ActionResult> {
  try {
    const u = await authorize("user.manage");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { ok: false, error: "Enter a valid email.", fieldErrors: { email: "Invalid email" } };
    if ((input.full_name ?? "").trim().length < 2) return { ok: false, error: "Enter a name.", fieldErrors: { full_name: "Required" } };
    if (!ROLES.includes(input.role as Role)) throw new Error("Unknown role.");
    if (input.role === "institution" && !input.institution_id) return { ok: false, error: "Pick the user's institution.", fieldErrors: { institution_id: "Required" } };
    await withIdempotency(input.idempotency_key, "user.create", async () => {
      const row = await one<{ id: string }>(
        "insert into profiles (email, full_name, role, institution_id, is_demo) values ($1,$2,$3,$4,true) returning id",
        [input.email.trim().toLowerCase(), input.full_name.trim(), input.role, input.role === "institution" ? input.institution_id : null]);
      await audit(toActor(u), "user.created", "profile", row!.id, input.full_name, { role: input.role });
      return { id: row!.id };
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    const r = fail(e);
    if (/profiles_email_key/.test(r.error)) return { ok: false, error: "A user with this email already exists.", fieldErrors: { email: "Already exists" } };
    return r;
  }
}

export async function saveSettings(input: unknown): Promise<ActionResult> {
  try {
    const u = await authorize("settings.manage");
    const v = settingsSchema.parse(input);
    const thresholds = [...new Set(v.thresholds.split(",").map((x) => Number(x.trim())))].sort((a, b) => b - a);
    const values: Record<string, unknown> = {
      reminder_thresholds: thresholds, max_file_mb: v.max_file_mb,
      verification_pending_days: v.verification_pending_days, release_sla_days: v.release_sla_days,
    };
    await tx(async (t) => {
      for (const [k, val] of Object.entries(values))
        await q("insert into system_settings (key, value, updated_at) values ($1,$2,now()) on conflict (key) do update set value=excluded.value, updated_at=now()",
          [k, JSON.stringify(val)], t);
      await audit(toActor(u), "settings.updated", "system", null, "System settings", values, t);
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRule(key: string, enabled: boolean, escalateDays: number): Promise<ActionResult> {
  try {
    const u = await authorize("settings.manage");
    if (!Number.isInteger(escalateDays) || escalateDays < 0 || escalateDays > 60) throw new Error("Escalation must be 0-60 days.");
    await q("update alert_rules set enabled=$1, escalate_after_days=$2 where key=$3", [enabled, escalateDays, key]);
    await audit(toActor(u), "alert_rule.updated", "alert_rule", key, key, { enabled, escalateDays });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDemoData(): Promise<ActionResult> {
  try {
    const u = await authorize("settings.manage");
    await resetDemo();
    // Settings were reseeded, so the simulated clock goes back to the real date in this process too.
    const { loadClock } = await import("@/lib/clock");
    await loadClock();
    // The acting admin profile was recreated with a new id; sign-in is required again.
    void u;
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Automation: scheduler and simulated clock ---------------- */

export async function saveScheduler(enabled: boolean, intervalMinutes: number): Promise<ActionResult> {
  try {
    const u = await authorize("settings.manage");
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) throw new Error("Interval must be 1-1440 minutes.");
    await q(`insert into system_settings (key, value, updated_at) values ('scheduler', $1, now())
             on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify({ enabled, interval_minutes: intervalMinutes })]);
    await audit(toActor(u), "settings.scheduler_updated", "system", null, "Automatic checks", { enabled, interval_minutes: intervalMinutes });
    revalidatePath("/settings");
    revalidatePath("/alerts");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Demonstration only: shifts the date the maturity rules use. Every change is audited and shown in a banner. */
export async function setSimulatedClock(days: number): Promise<ActionResult> {
  try {
    const u = await authorize("settings.manage");
    if (!Number.isInteger(days) || days < -60 || days > 400) throw new Error("Offset must be between -60 and 400 days.");
    const { setClockOffset } = await import("@/lib/clock");
    const before = await getSetting<number>("clock_offset_days", 0);
    await q(`insert into system_settings (key, value, updated_at) values ('clock_offset_days', $1, now())
             on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(days)]);
    setClockOffset(days);
    await audit(toActor(u), "settings.simulated_clock_changed", "system", null, "Simulated clock", { from_days: before, to_days: days, simulated_today: todayISO() });
    revalidateAll();
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
