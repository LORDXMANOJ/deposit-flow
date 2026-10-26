import "server-only";
import { q, one } from "./db";
import type { SessionUser } from "./auth";
import { isScoped } from "./rbac";
import { addDaysISO, todayISO } from "./maturity";
import { getSetting } from "./alert-engine";

export type DashFilters = { institution?: string; type?: string; from?: string; to?: string };

/** Every number on the dashboard is computed here from records; nothing is hard-coded. */
export async function getDashboard(u: SessionUser, f: DashFilters) {
  const today = todayISO();
  const in30 = addDaysISO(today, 30);
  const params: unknown[] = [];
  const conds: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };
  if (isScoped(u.role)) add("d.institution_id = ?", u.institutionId);
  else if (f.institution && /^[0-9a-f-]{36}$/.test(f.institution)) add("d.institution_id = ?", f.institution);
  if (f.type) add("d.deposit_type = ?", f.type);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) add("d.deposit_date >= ?", f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) add("d.deposit_date <= ?", f.to);
  const W = conds.length ? ` and ${conds.join(" and ")}` : "";
  const depJoin = `from deposits d where true${W}`;
  const fdrBase = `from fdr_records f join deposits d on d.id = f.deposit_id join institutions i on i.id = f.institution_id where true${W}`;
  const pendingDays = await getSetting<number>("verification_pending_days", 3);
  const scopeInst = isScoped(u.role) ? " where id = $1" : "";

  const [kpi, institutions, byStatus, byMonth, workload, byInst, upcoming, queue, overdue, alerts, recent, audit] = await Promise.all([
    one<{ active: number; value: string; maturing: number; pending_docs: number; overdue_rel: number; stale_docs: number;
      week: number; week_value: string; past_due: number; open_alerts: number }>(
      `select
        (select count(*)::int ${fdrBase} and f.lifecycle_status='active' and f.maturity_date between '${today}' and '${addDaysISO(today, 7)}') as week,
        (select coalesce(sum(f.principal),0)::numeric(16,2)::text ${fdrBase} and f.lifecycle_status='active' and f.maturity_date between '${today}' and '${addDaysISO(today, 7)}') as week_value,
        (select count(*)::int ${fdrBase} and f.lifecycle_status in ('active','matured') and f.maturity_date < '${today}'
           and not exists (select 1 from release_requests rr where rr.fdr_id=f.id and rr.status <> 'rejected')
           and f.renewal_status in ('none','pending','rejected')) as past_due,
        (select count(*)::int from alerts a where a.status='open'${isScoped(u.role) ? ` and a.institution_id='${u.institutionId}'` : ""}) as open_alerts,
        (select count(*)::int ${depJoin} and d.status not in ('released','rejected')) as active,
        (select coalesce(sum(d.principal),0)::numeric(16,2)::text ${depJoin} and d.status not in ('released','rejected')) as value,
        (select count(*)::int ${fdrBase} and f.lifecycle_status='active' and f.maturity_date between '${today}' and '${in30}') as maturing,
        (select count(*)::int from documents o join deposits d on d.id=o.deposit_id where o.status='pending_review'${W}) as pending_docs,
        (select count(*)::int from release_requests r join deposits d on d.id=r.deposit_id where r.status in ('submitted','under_review','info_requested') and r.due_date < '${today}'${W}) as overdue_rel,
        (select count(*)::int from documents o join deposits d on d.id=o.deposit_id where o.status='pending_review' and o.updated_at < now() - interval '${pendingDays} days'${W}) as stale_docs`, params),
    one<{ n: number; active: number }>(`select count(*)::int as n, count(*) filter (where status='active')::int as active from institutions${scopeInst}`,
      isScoped(u.role) ? [u.institutionId] : []),
    q<{ status: string; value: string; n: number }>(`select d.status, sum(d.principal)::numeric(16,2)::text as value, count(*)::int as n ${depJoin} group by d.status order by sum(d.principal) desc`, params),
    q<{ month: string; n: number; value: string }>(
      `select to_char(f.maturity_date, 'YYYY-MM') as month, count(*)::int as n, sum(f.principal)::numeric(16,2)::text as value ${fdrBase}
       and f.lifecycle_status in ('active','matured') and f.maturity_date between date_trunc('month', '${today}'::date) and ('${today}'::date + interval '11 months')
       group by 1 order by 1`, params),
    q<{ status: string; n: number }>(`select o.status, count(*)::int as n from documents o join deposits d on d.id=o.deposit_id where true${W} group by o.status`, params),
    q<{ name: string; id: string; value: string }>(
      `select i.name, i.id, sum(d.principal)::numeric(16,2)::text as value from deposits d join institutions i on i.id=d.institution_id
       where d.status not in ('released','rejected')${W} group by i.id, i.name order by sum(d.principal) desc`, params),
    q<{ id: string; fdr_number: string; inst: string; principal: string; maturity_date: string; lifecycle_status: string; verification_status: string; renewal_status: string }>(
      `select f.id, f.fdr_number, i.name as inst, f.principal, f.maturity_date, f.lifecycle_status, f.verification_status, f.renewal_status ${fdrBase}
       and f.lifecycle_status in ('active','matured') and f.maturity_date <= '${addDaysISO(today, 45)}' order by f.maturity_date limit 8`, params),
    q<{ id: string; code: string; title: string; inst: string; updated_at: string; current_version: number }>(
      `select o.id, o.code, o.title, i.name as inst, o.updated_at, o.current_version from documents o join deposits d on d.id=o.deposit_id
       join institutions i on i.id=o.institution_id where o.status='pending_review'${W} order by o.updated_at limit 6`, params),
    q<{ id: string; code: string; inst: string; due_date: string; status: string }>(
      `select r.id, r.code, i.name as inst, r.due_date, r.status from release_requests r join deposits d on d.id=r.deposit_id join institutions i on i.id=r.institution_id
       where r.status in ('submitted','under_review','info_requested') and r.due_date < '${today}'${W} order by r.due_date limit 6`, params),
    q<{ id: string; code: string; title: string; severity: string; created_at: string; entity_type: string; entity_id: string }>(
      `select a.id, a.code, a.title, a.severity, a.created_at, a.entity_type, a.entity_id from alerts a
       where a.status='open' and a.severity in ('critical','high')${isScoped(u.role) ? " and a.institution_id = $1" : ""}
       order by case a.severity when 'critical' then 0 else 1 end, a.created_at desc limit 6`, isScoped(u.role) ? [u.institutionId] : []),
    q<{ id: string; code: string; inst: string; status: string; principal: string; updated_at: string }>(
      `select d.id, d.code, i.name as inst, d.status, d.principal, d.updated_at from deposits d join institutions i on i.id=d.institution_id
       where true${W} order by d.updated_at desc limit 6`, params),
    u.role === "institution" ? Promise.resolve([]) :
      q<{ id: number; actor_name: string; action: string; entity_label: string | null; created_at: string }>(
        "select id, actor_name, action, entity_label, created_at from audit_logs order by created_at desc limit 7"),
  ]);

  // Outcome measures named in the official problem statement: verification turnaround,
  // record accuracy (discrepancies caught, verified share) and renewal monitoring coverage.
  const scopeA = isScoped(u.role) ? ` and d.institution_id = '${u.institutionId}'` : "";
  const outcomes = (await one<{ turnaround_h: string | null; reviews: number; mismatches: number; mismatches_open: number;
    due30: number; due30_reminded: number; active: number; active_verified: number }>(
    `select
       (select round(avg(extract(epoch from (r.reviewed_at - v.uploaded_at)) / 3600)::numeric, 1)::text
          from verification_reviews r join documents d on d.id = r.document_id
          join document_versions v on v.document_id = r.document_id and v.version = r.version where true${scopeA}) as turnaround_h,
       (select count(*)::int from verification_reviews r join documents d on d.id = r.document_id where true${scopeA}) as reviews,
       (select count(*)::int from alerts a where a.rule_key = 'register_mismatch'${isScoped(u.role) ? ` and a.institution_id = '${u.institutionId}'` : ""}) as mismatches,
       (select count(*)::int from alerts a where a.rule_key = 'register_mismatch' and a.status <> 'resolved'${isScoped(u.role) ? ` and a.institution_id = '${u.institutionId}'` : ""}) as mismatches_open,
       (select count(*)::int ${fdrBase} and f.lifecycle_status = 'active' and f.maturity_date between '${today}' and '${in30}') as due30,
       (select count(*)::int ${fdrBase} and f.lifecycle_status = 'active' and f.maturity_date between '${today}' and '${in30}'
          and exists (select 1 from alerts a where a.entity_id = f.id and a.rule_key = 'fdr_maturity')) as due30_reminded,
       (select count(*)::int ${fdrBase} and f.lifecycle_status in ('active','matured')) as active,
       (select count(*)::int ${fdrBase} and f.lifecycle_status in ('active','matured') and f.verification_status = 'approved') as active_verified`, params))!;

  return { today, outcomes, kpi: kpi!, institutions: institutions!, byStatus, byMonth, workload, byInst, upcoming, queue, overdue, alerts, recent, audit, pendingDays };
}
