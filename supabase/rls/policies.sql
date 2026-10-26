-- Row Level Security for a Supabase deployment of DepositFlow.
-- NOT applied in demo mode (PGlite has no auth.uid()). In demo mode the same rules are enforced in
-- server actions (src/lib/rbac.ts, src/lib/auth.ts). Apply this file after 0001_schema.sql on Supabase,
-- with profiles.id equal to auth.users.id. Written for the prototype; not yet tested against a live project.

create or replace function app_role() returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;
create or replace function app_institution() returns uuid language sql stable security definer set search_path = public as $$
  select institution_id from profiles where id = auth.uid()
$$;
create or replace function sees_institution(inst uuid) returns boolean language sql stable as $$
  select app_role() in ('admin','verifier','finance','auditor') or (app_role() = 'institution' and inst = app_institution())
$$;

alter table institutions enable row level security;
alter table profiles enable row level security;
alter table deposits enable row level security;
alter table fdr_records enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table verification_reviews enable row level security;
alter table release_requests enable row level security;
alter table workflow_events enable row level security;
alter table alert_rules enable row level security;
alter table alerts enable row level security;
alter table alert_actions enable row level security;
alter table notification_events enable row level security;
alter table audit_logs enable row level security;
alter table system_settings enable row level security;
alter table idempotency_keys enable row level security;

-- Reads follow institution scope.
create policy inst_read on institutions for select using (sees_institution(id));
create policy dep_read on deposits for select using (sees_institution(institution_id));
create policy fdr_read on fdr_records for select using (sees_institution(institution_id));
create policy doc_read on documents for select using (sees_institution(institution_id));
create policy docv_read on document_versions for select using (exists (select 1 from documents d where d.id = document_id and sees_institution(d.institution_id)));
create policy rev_read on verification_reviews for select using (exists (select 1 from documents d where d.id = document_id and sees_institution(d.institution_id)));
create policy rel_read on release_requests for select using (sees_institution(institution_id));
create policy alert_read on alerts for select using (institution_id is null or sees_institution(institution_id));
create policy wf_read on workflow_events for select using (app_role() is not null);
create policy rules_read on alert_rules for select using (app_role() is not null);
create policy settings_read on system_settings for select using (app_role() is not null);
create policy profile_self on profiles for select using (id = auth.uid() or app_role() = 'admin');
create policy notif_own on notification_events for select using (user_id = auth.uid());
create policy notif_mark on notification_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Writes. Auditors get no write policy at all.
create policy inst_write on institutions for all using (app_role() = 'admin') with check (app_role() = 'admin');
create policy dep_insert on deposits for insert with check (app_role() = 'admin' or (app_role() = 'institution' and institution_id = app_institution()));
create policy dep_update on deposits for update using (app_role() in ('admin','verifier','finance') or (app_role() = 'institution' and institution_id = app_institution()));
create policy fdr_insert on fdr_records for insert with check (app_role() = 'admin' or (app_role() = 'institution' and institution_id = app_institution()));
create policy fdr_update on fdr_records for update using (app_role() in ('admin','verifier','finance') or (app_role() = 'institution' and institution_id = app_institution()));
create policy doc_insert on documents for insert with check (app_role() = 'admin' or (app_role() = 'institution' and institution_id = app_institution()));
create policy doc_update on documents for update using (app_role() in ('admin','verifier') or (app_role() = 'institution' and institution_id = app_institution()));
create policy docv_insert on document_versions for insert with check (exists (select 1 from documents d where d.id = document_id and (app_role() = 'admin' or d.institution_id = app_institution())));
create policy rev_insert on verification_reviews for insert with check (app_role() in ('admin','verifier'));
create policy rel_insert on release_requests for insert with check (app_role() = 'admin' or (app_role() = 'institution' and institution_id = app_institution()));
create policy rel_update on release_requests for update using (app_role() in ('admin','finance') or (app_role() = 'institution' and institution_id = app_institution()));
create policy alert_update on alerts for update using (app_role() in ('admin','verifier','finance'));
create policy rules_write on alert_rules for update using (app_role() = 'admin');
create policy settings_write on system_settings for all using (app_role() = 'admin') with check (app_role() = 'admin');
create policy users_write on profiles for update using (app_role() = 'admin');

-- Audit trail: anyone signed in may append; only admins and auditors may read; nobody may update or delete
-- (the trigger in 0001_schema.sql also blocks it for the table owner).
create policy audit_append on audit_logs for insert with check (app_role() is not null);
create policy audit_read on audit_logs for select using (app_role() in ('admin','auditor'));

-- Storage: create a PRIVATE bucket "documents" and serve files only through signed URLs from the server.
