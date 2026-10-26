-- DepositFlow schema. Plain Postgres: runs on PGlite (demo mode) and on Supabase.
-- Statuses and workflows below are DEMONSTRATION logic, not official AICTE classifications.

create sequence if not exists inst_seq start 1001;
create sequence if not exists dep_seq start 2001;
create sequence if not exists fdr_seq start 3001;
create sequence if not exists rel_seq start 4001;
create sequence if not exists alert_seq start 5001;
create sequence if not exists doc_seq start 6001;

create table institutions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('INS-' || nextval('inst_seq')),
  name text not null check (length(trim(name)) >= 3),
  category text not null check (category in ('Engineering','Management','Pharmacy','Architecture','Polytechnic','Other')),
  aicte_ref text,
  state text not null,
  district text not null,
  contact_name text not null,
  contact_email text not null check (contact_email like '%_@_%.__%'),
  contact_phone text not null,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index institutions_name_idx on institutions (lower(name));
create index institutions_state_idx on institutions (state);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin','institution','verifier','finance','auditor')),
  institution_id uuid references institutions (id) on delete set null,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role <> 'institution' or institution_id is not null)
);

create table deposits (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DEP-' || nextval('dep_seq')),
  institution_id uuid not null references institutions (id) on delete restrict,
  deposit_type text not null check (deposit_type in ('Security Deposit','Performance Guarantee','Earnest Money','Other')),
  principal numeric(16,2) not null check (principal > 0),
  deposit_date date not null,
  bank text not null,
  status text not null default 'draft' check (status in
    ('draft','submitted','under_review','verified','action_required','matured','release_requested','released','rejected')),
  verification_status text not null default 'not_submitted' check (verification_status in
    ('not_submitted','pending','approved','rejected','changes_requested')),
  renewal_status text not null default 'none' check (renewal_status in
    ('none','pending','initiated','submitted','under_review','verified','rejected')),
  release_status text not null default 'none' check (release_status in
    ('none','requested','approved','released','rejected')),
  notes text,
  is_demo boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deposits_inst_idx on deposits (institution_id);
create index deposits_status_idx on deposits (status);
create index deposits_date_idx on deposits (deposit_date);

create table fdr_records (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('FDR-' || nextval('fdr_seq')),
  deposit_id uuid not null references deposits (id) on delete restrict,
  institution_id uuid not null references institutions (id) on delete restrict,
  fdr_number text not null unique,
  bank text not null,
  principal numeric(16,2) not null check (principal > 0),
  issue_date date not null,
  maturity_date date not null,
  renewal_status text not null default 'none' check (renewal_status in
    ('none','pending','initiated','submitted','under_review','verified','rejected')),
  verification_status text not null default 'not_submitted' check (verification_status in
    ('not_submitted','pending','approved','rejected','changes_requested')),
  lifecycle_status text not null default 'active' check (lifecycle_status in
    ('active','matured','renewed','released','closed')),
  previous_fdr_id uuid references fdr_records (id) on delete restrict,
  last_notified_at timestamptz,
  remarks text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maturity_date > issue_date)
);
create index fdr_maturity_idx on fdr_records (maturity_date);
create index fdr_deposit_idx on fdr_records (deposit_id);
create index fdr_inst_idx on fdr_records (institution_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DOC-' || nextval('doc_seq')),
  institution_id uuid not null references institutions (id) on delete restrict,
  deposit_id uuid references deposits (id) on delete restrict,
  fdr_id uuid references fdr_records (id) on delete restrict,
  doc_type text not null check (doc_type in ('fdr_receipt','bank_document','supporting','verification_note')),
  title text not null,
  current_version int not null default 1,
  status text not null default 'uploaded' check (status in
    ('uploaded','pending_review','approved','rejected','changes_requested')),
  uploaded_by uuid references profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_fdr_idx on documents (fdr_id);
create index documents_status_idx on documents (status);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version int not null,
  storage_key text not null unique,
  original_name text not null,
  mime text not null,
  size_bytes int not null check (size_bytes > 0),
  sha256 text not null,
  -- Values typed in by the uploader from the document face. UNVERIFIED. No OCR in this prototype.
  declared_fdr_number text,
  declared_amount numeric(16,2),
  declared_maturity date,
  uploaded_by uuid references profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (document_id, version)
);

create table verification_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version int not null,
  reviewer_id uuid references profiles (id) on delete set null,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  remarks text,
  mode text not null default 'manual' check (mode in ('manual','simulated')),
  reviewed_at timestamptz not null default now()
);

create table release_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('REL-' || nextval('rel_seq')),
  deposit_id uuid not null references deposits (id) on delete restrict,
  fdr_id uuid references fdr_records (id) on delete restrict,
  institution_id uuid not null references institutions (id) on delete restrict,
  requested_by uuid references profiles (id) on delete set null,
  reason text not null check (length(trim(reason)) >= 10),
  status text not null default 'submitted' check (status in
    ('submitted','under_review','info_requested','approved','rejected','released')),
  reviewer_id uuid references profiles (id) on delete set null,
  reviewer_comments text,
  decided_at timestamptz,
  outcome_ref text,
  outcome_mode text check (outcome_mode in ('simulated','manual_confirmation')),
  processed_by uuid references profiles (id) on delete set null,
  processed_at timestamptz,
  due_date date not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index release_status_idx on release_requests (status);

create table workflow_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  from_status text,
  to_status text not null,
  actor_id uuid references profiles (id) on delete set null,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);
create index workflow_entity_idx on workflow_events (entity_type, entity_id, created_at);

create table alert_rules (
  key text primary key,
  name text not null,
  description text not null,
  enabled boolean not null default true,
  severity text not null check (severity in ('info','warning','high','critical')),
  params jsonb not null default '{}'::jsonb,
  assigned_role text not null check (assigned_role in ('admin','institution','verifier','finance','auditor')),
  escalate_after_days int not null default 3 check (escalate_after_days >= 0)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('ALT-' || nextval('alert_seq')),
  rule_key text not null references alert_rules (key),
  entity_type text not null,
  entity_id uuid not null,
  institution_id uuid references institutions (id) on delete cascade,
  threshold int not null default 0,
  severity text not null check (severity in ('info','warning','high','critical')),
  title text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  assigned_role text not null,
  escalation_level int not null default 0,
  escalated_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Idempotency: one alert per rule + record + threshold. Retry/reset deletes or reopens explicitly.
  dedupe_key text not null unique
);
create index alerts_status_idx on alerts (status, severity);
create index alerts_entity_idx on alerts (entity_type, entity_id);

create table alert_actions (
  id bigint generated always as identity primary key,
  alert_id uuid not null references alerts (id) on delete cascade,
  action text not null,
  actor_id uuid references profiles (id) on delete set null,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  alert_id uuid references alerts (id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  channel text not null default 'in_app' check (channel in ('in_app')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, alert_id)
);
create index notif_user_idx on notification_events (user_id, read_at);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on audit_logs (created_at desc);
create index audit_entity_idx on audit_logs (entity_type, entity_id);

-- Append-only: normal application permissions cannot edit or delete audit history.
create function audit_logs_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function audit_logs_immutable();

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Prevents double-creation when a form is submitted twice or a request is retried.
create table idempotency_keys (
  key text primary key,
  scope text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
