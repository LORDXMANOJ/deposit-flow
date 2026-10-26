import "server-only";
import { q, tx } from "./db";
import { audit, type Actor } from "./audit";
import { dueThreshold, severityForThreshold, daysUntil, todayISO, DEFAULT_THRESHOLDS } from "./maturity";
import { relativeDays } from "./format";
import { formatINR } from "./money";

/**
 * Real rule evaluation. "Run checks now" calls runChecks(), which reads the database, evaluates every
 * enabled rule, and inserts alert rows. It is idempotent: alerts carry a unique dedupe_key
 * (rule + record + threshold), so running twice never duplicates. A background scheduler is NOT
 * configured in this prototype; call runChecks() from cron (Vercel Cron / Supabase pg_cron) to automate.
 */

type Candidate = {
  rule: string;
  entityType: string;
  entityId: string;
  institutionId: string | null;
  threshold: number;
  severity: "info" | "warning" | "high" | "critical";
  title: string;
  message: string;
  fdrId?: string;
};

export type RunSummary = {
  ranAt: string;
  rulesEvaluated: number;
  candidates: number;
  created: number;
  autoResolved: number;
  escalated: number;
  byRule: Record<string, number>;
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await q<{ value: T }>("select value from system_settings where key = $1", [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function collectCandidates(today = todayISO()): Promise<{ list: Candidate[]; rulesEvaluated: string[] }> {
  const rules = await q<{ key: string; severity: Candidate["severity"] }>("select key, severity from alert_rules where enabled");
  const enabled = new Set(rules.map((r) => r.key));
  const sev = Object.fromEntries(rules.map((r) => [r.key, r.severity])) as Record<string, Candidate["severity"]>;
  const thresholds = await getSetting<number[]>("reminder_thresholds", [...DEFAULT_THRESHOLDS]);
  const pendingDays = await getSetting<number>("verification_pending_days", 3);
  const out: Candidate[] = [];

  type F = { id: string; code: string; fdr_number: string; institution_id: string; maturity_date: string; lifecycle_status: string;
    principal: string; renewal_status: string; verification_status: string; previous_fdr_id: string | null; inst: string };
  const fdrs = await q<F>(
    `select f.id, f.code, f.fdr_number, f.institution_id, f.maturity_date, f.lifecycle_status, f.principal, f.renewal_status,
            f.verification_status, f.previous_fdr_id, i.name as inst
     from fdr_records f join institutions i on i.id = f.institution_id`,
  );

  if (enabled.has("fdr_maturity")) {
    for (const f of fdrs) {
      const t = dueThreshold(f.maturity_date, today, f.lifecycle_status, thresholds);
      if (t === null || t < 0) continue;
      const d = daysUntil(f.maturity_date, today);
      out.push({
        rule: "fdr_maturity", entityType: "fdr", entityId: f.id, fdrId: f.id, institutionId: f.institution_id, threshold: t,
        severity: severityForThreshold(t),
        title: `${f.fdr_number} matures ${relativeDays(d)}`,
        message: `${f.inst}: ${formatINR(f.principal, { decimals: false })} FDR matures on ${f.maturity_date}. Record the renewal or release instruction.`,
      });
    }
  }

  if (enabled.has("fdr_matured_no_action")) {
    const busy = await q<{ fdr_id: string }>(
      "select distinct fdr_id from release_requests where status not in ('rejected') and fdr_id is not null",
    );
    const busySet = new Set(busy.map((b) => b.fdr_id));
    for (const f of fdrs) {
      if (["released", "renewed", "closed"].includes(f.lifecycle_status)) continue;
      if (daysUntil(f.maturity_date, today) >= 0) continue;
      if (busySet.has(f.id) || ["initiated", "submitted", "under_review", "verified"].includes(f.renewal_status)) continue;
      out.push({
        rule: "fdr_matured_no_action", entityType: "fdr", entityId: f.id, fdrId: f.id, institutionId: f.institution_id, threshold: -1,
        severity: sev["fdr_matured_no_action"] ?? "critical",
        title: `${f.fdr_number} matured with no recorded next action`,
        message: `${f.inst}: matured on ${f.maturity_date} (${relativeDays(daysUntil(f.maturity_date, today))}). No renewal or release request is in progress.`,
      });
    }
  }

  if (enabled.has("verification_pending")) {
    const rows = await q<{ id: string; code: string; title: string; institution_id: string; age: number }>(
      `select id, code, title, institution_id, floor(extract(epoch from (now() - updated_at)) / 86400)::int as age
       from documents where status = 'pending_review'`,
    );
    for (const r of rows) {
      if (r.age < pendingDays) continue;
      out.push({
        rule: "verification_pending", entityType: "document", entityId: r.id, institutionId: r.institution_id, threshold: 0,
        severity: sev["verification_pending"] ?? "high",
        title: `${r.code} awaiting verification for ${r.age} days`,
        message: `"${r.title}" has been pending review longer than the ${pendingDays}-day target.`,
      });
    }
  }

  if (enabled.has("missing_document")) {
    const withDoc = new Set((await q<{ fdr_id: string }>("select distinct fdr_id from documents where fdr_id is not null and doc_type='fdr_receipt'")).map((r) => r.fdr_id));
    for (const f of fdrs) {
      if (["released", "renewed", "closed"].includes(f.lifecycle_status) || withDoc.has(f.id)) continue;
      out.push({
        rule: "missing_document", entityType: "fdr", entityId: f.id, fdrId: f.id, institutionId: f.institution_id, threshold: 0,
        severity: sev["missing_document"] ?? "warning",
        title: `No FDR receipt uploaded for ${f.fdr_number}`,
        message: `${f.inst}: upload the bank-issued FDR receipt so it can be reviewed.`,
      });
    }
  }

  if (enabled.has("release_overdue")) {
    const rows = await q<{ id: string; code: string; institution_id: string; due_date: string }>(
      "select id, code, institution_id, due_date from release_requests where status in ('submitted','under_review','info_requested') and due_date < $1",
      [today],
    );
    for (const r of rows)
      out.push({
        rule: "release_overdue", entityType: "release", entityId: r.id, institutionId: r.institution_id, threshold: 0,
        severity: sev["release_overdue"] ?? "high",
        title: `${r.code} is past its due date`,
        message: `Release request was due ${r.due_date} (${relativeDays(daysUntil(r.due_date, today))}) and has no final decision.`,
      });
  }

  if (enabled.has("renewal_doc_rejected")) {
    for (const f of fdrs) {
      if (!f.previous_fdr_id) continue;
      if (f.renewal_status !== "rejected" && !["rejected", "changes_requested"].includes(f.verification_status)) continue;
      out.push({
        rule: "renewal_doc_rejected", entityType: "fdr", entityId: f.id, fdrId: f.id, institutionId: f.institution_id, threshold: 0,
        severity: sev["renewal_doc_rejected"] ?? "high",
        title: `Renewal document for ${f.fdr_number} needs attention`,
        message: `${f.inst}: the renewal FDR was rejected or sent back for changes. Upload a corrected document.`,
      });
    }
  }

  if (enabled.has("register_mismatch")) {
    const rows = await q<{ fdr_id: string; fdr_number: string; institution_id: string; reg_no: string; reg_amt: string; reg_mat: string;
      d_no: string | null; d_amt: string | null; d_mat: string | null }>(
      `select f.id as fdr_id, f.fdr_number, f.institution_id, f.fdr_number as reg_no, f.principal as reg_amt, f.maturity_date as reg_mat,
              v.declared_fdr_number as d_no, v.declared_amount as d_amt, v.declared_maturity as d_mat
       from fdr_records f
       join documents d on d.fdr_id = f.id and d.doc_type = 'fdr_receipt'
       join document_versions v on v.document_id = d.id and v.version = d.current_version`,
    );
    for (const r of rows) {
      const diffs: string[] = [];
      if (r.d_no && r.d_no !== r.reg_no) diffs.push(`FDR number (${r.d_no} vs ${r.reg_no})`);
      if (r.d_amt && r.d_amt !== r.reg_amt) diffs.push(`amount (${formatINR(r.d_amt, { decimals: false })} vs ${formatINR(r.reg_amt, { decimals: false })})`);
      if (r.d_mat && r.d_mat !== r.reg_mat) diffs.push(`maturity (${r.d_mat} vs ${r.reg_mat})`);
      if (!diffs.length) continue;
      out.push({
        rule: "register_mismatch", entityType: "fdr", entityId: r.fdr_id, fdrId: r.fdr_id, institutionId: r.institution_id, threshold: 0,
        severity: sev["register_mismatch"] ?? "high",
        title: `Register and document differ for ${r.fdr_number}`,
        message: `Values typed from the document face (unverified) differ from the register: ${diffs.join("; ")}.`,
      });
    }
  }

  return { list: out, rulesEvaluated: [...enabled] };
}

const dedupe = (c: Candidate) => `${c.rule}:${c.entityType}:${c.entityId}:${c.threshold}`;

export async function runChecks(actor: Actor): Promise<RunSummary> {
  const today = todayISO();
  const { list, rulesEvaluated } = await collectCandidates(today);
  const ruleMeta = await q<{ key: string; assigned_role: string; escalate_after_days: number }>(
    "select key, assigned_role, escalate_after_days from alert_rules",
  );
  const meta = Object.fromEntries(ruleMeta.map((r) => [r.key, r]));
  const summary: RunSummary = { ranAt: new Date().toISOString(), rulesEvaluated: rulesEvaluated.length, candidates: list.length,
    created: 0, autoResolved: 0, escalated: 0, byRule: {} };

  await tx(async (t) => {
    const keep = new Set<string>();
    for (const c of list) {
      const key = dedupe(c);
      keep.add(key);
      const m = meta[c.rule];
      const ins = await q<{ id: string }>(
        `insert into alerts (rule_key, entity_type, entity_id, institution_id, threshold, severity, title, message, assigned_role, dedupe_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (dedupe_key) do nothing returning id`,
        [c.rule, c.entityType, c.entityId, c.institutionId, c.threshold, c.severity, c.title, c.message, m.assigned_role, key], t);
      if (!ins.length) continue;
      const id = ins[0].id;
      summary.created++;
      summary.byRule[c.rule] = (summary.byRule[c.rule] ?? 0) + 1;
      await q("insert into alert_actions (alert_id, action, actor_id, actor_name, note) values ($1,'created',$2,$3,$4)",
        [id, actor.id, actor.name, `Rule ${c.rule}`], t);
      await notifyRecipients(id, c, m.assigned_role, t);
      if (c.fdrId && c.rule === "fdr_maturity")
        await q("update fdr_records set last_notified_at = now() where id = $1", [c.fdrId], t);
    }

    // Auto-resolve open alerts whose condition no longer holds (or whose threshold was superseded).
    const open = await q<{ id: string; dedupe_key: string; rule_key: string }>(
      "select id, dedupe_key, rule_key from alerts where status <> 'resolved'", [], t);
    for (const a of open) {
      if (!rulesEvaluated.includes(a.rule_key) || keep.has(a.dedupe_key)) continue;
      await q("update alerts set status='resolved', resolved_at=now() where id=$1", [a.id], t);
      await q("insert into alert_actions (alert_id, action, actor_id, actor_name, note) values ($1,'auto_resolved',$2,$3,'Condition no longer holds')",
        [a.id, actor.id, actor.name], t);
      summary.autoResolved++;
    }

    // Escalation: open and unacknowledged beyond the rule's interval -> notify administrators once.
    const due = await q<{ id: string; rule_key: string; title: string }>(
      `select a.id, a.rule_key, a.title from alerts a join alert_rules r on r.key = a.rule_key
       where a.status = 'open' and a.escalation_level = 0 and a.created_at + (r.escalate_after_days || ' days')::interval <= now()
         and a.created_at < now() - interval '1 minute'`, [], t);
    for (const a of due) {
      await q("update alerts set escalation_level = 1, escalated_at = now() where id = $1", [a.id], t);
      await q("insert into alert_actions (alert_id, action, actor_id, actor_name, note) values ($1,'escalated',$2,$3,'Escalated to Administrator')",
        [a.id, actor.id, actor.name], t);
      await q(
        `insert into notification_events (user_id, alert_id, title, body, link)
         select p.id, $1, $2, 'Escalated: no acknowledgement within the configured interval.', '/alerts' from profiles p
         where p.role = 'admin' and p.active on conflict (user_id, alert_id) do nothing`, [a.id, "Escalated: " + a.title], t);
      summary.escalated++;
    }

    await audit(actor, "alerts.run_checks", "system", null, "Alert engine",
      { created: summary.created, autoResolved: summary.autoResolved, escalated: summary.escalated, candidates: summary.candidates }, t);
  });
  return summary;
}

async function notifyRecipients(alertId: string, c: Candidate, role: string, t: Parameters<typeof q>[2]) {
  await q(
    `insert into notification_events (user_id, alert_id, title, body, link)
     select p.id, $1, $2, $3, $4 from profiles p
     where p.active and ((p.role = $5 and p.role <> 'institution') or (p.role = 'institution' and p.institution_id = $6))
     on conflict (user_id, alert_id) do nothing`,
    [alertId, c.title, c.message, linkFor(c), role, c.institutionId], t);
}

export function linkFor(c: { entityType: string; entityId: string }): string {
  if (c.entityType === "document") return `/verification?status=all&doc=${c.entityId}`;
  if (c.entityType === "release") return `/releases?tab=all&open=${c.entityId}`;
  if (c.entityType === "deposit") return `/deposits/${c.entityId}`;
  if (c.entityType === "fdr") return `/fdrs/${c.entityId}`;
  return "/alerts";
}
