-- Franklin Offshore ePermit MVP
-- Schema: Hot Work Permit (Onshore) — FOI-SG-057
-- Migration 0001: Core tables

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================

create type user_role as enum (
  'applicant',
  'guest_applicant',
  'contractor',
  'assessor',
  'srm',
  'admin'
);

create type permit_state as enum (
  'draft',
  'pending_safety_assessment',
  'not_fit',
  'pending_srm_approval',
  'rejected',
  'approved_active',
  'pending_daily_endorsement',
  'revoked',
  'pending_closure',
  'closed_completed',
  'expired'
);

create type permit_stage_label as enum ('I', 'II', 'III', 'IV');

create type endorsement_action as enum ('continue', 'reject', 'revoke');

create type audit_action as enum (
  'created',
  'created_by_guest_applicant',
  'user_created',
  'submitted',
  'fit',
  'not_fit',
  'approved',
  'rejected',
  'revoked',
  'endorsed_continue',
  'endorsed_reject',
  'endorsed_revoke',
  'closed',
  'expired',
  'photo_added',
  'photo_removed',
  'document_added',
  'document_removed',
  'permit_updated',
  'user_updated',
  'user_activated',
  'user_deactivated',
  'user_site_role_added',
  'user_site_role_updated',
  'user_site_role_removed'
);

-- =========================================================
-- USERS
-- =========================================================
-- Mirrors auth.users with role/qualification metadata.
-- Linked 1:1 by id = auth.users.id.

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  department text,
  role user_role not null default 'applicant',
  qualified_for text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_role_idx on public.users (role) where active = true;

-- =========================================================
-- PERMITS
-- =========================================================

create table public.permits (
  id uuid primary key default gen_random_uuid(),
  serial_no text unique not null,
  permit_type text not null default 'hot_work_onshore',
  state permit_state not null default 'draft',

  vessel_project text not null,
  location_of_work text not null,
  date_commencement date not null,
  date_completion date not null,
  description text not null,
  hazard_types text[] not null default '{}',
  contractor text not null,

  applicant_id uuid not null references public.users(id),
  assessor_id uuid references public.users(id),
  srm_id uuid references public.users(id),
  closer_id uuid references public.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint permits_completion_after_commencement
    check (date_completion >= date_commencement),

  constraint permits_description_min_length
    check (char_length(description) >= 10)
);

create index permits_state_idx on public.permits (state);
create index permits_applicant_idx on public.permits (applicant_id);
create index permits_assessor_idx on public.permits (assessor_id);
create index permits_srm_idx on public.permits (srm_id);
create index permits_completion_idx on public.permits (date_completion);

-- =========================================================
-- PERMIT STAGES
-- =========================================================

create table public.permit_stages (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  stage permit_stage_label not null,
  user_id uuid not null references public.users(id),
  data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),

  unique (permit_id, stage)
);

create index permit_stages_permit_idx on public.permit_stages (permit_id);

-- =========================================================
-- PERMIT ENDORSEMENTS DAY 2-14
-- =========================================================

create table public.permit_endorsements (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  day_number int not null check (day_number between 2 and 14),
  endorser_id uuid not null references public.users(id),
  action endorsement_action not null,
  remarks text,
  ts timestamptz not null default now(),

  unique (permit_id, day_number),

  constraint endorsement_remarks_required
    check (
      action = 'continue'
      or (
        remarks is not null
        and char_length(trim(remarks)) > 0
      )
    )
);

create index endorsements_permit_idx on public.permit_endorsements (permit_id);

-- =========================================================
-- PERMIT PHOTOS
-- =========================================================

create table public.permit_photos (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  storage_path text not null,
  annotation_data jsonb,
  uploaded_by uuid not null references public.users(id),
  uploaded_at timestamptz not null default now()
);

create index photos_permit_idx on public.permit_photos (permit_id);

-- =========================================================
-- AUDIT LOG
-- =========================================================

create table public.audit_log (
  id bigserial primary key,
  permit_id uuid references public.permits(id) on delete set null,
  actor_id uuid references public.users(id),
  action audit_action not null,
  from_state permit_state,
  to_state permit_state,
  reason text,
  metadata jsonb,
  ts timestamptz not null default now()
);

create index audit_log_permit_idx on public.audit_log (permit_id, ts desc);
create index audit_log_actor_idx on public.audit_log (actor_id, ts desc);

-- =========================================================
-- PERMIT NUMBERING
-- =========================================================

create table public.permit_counters (
  permit_type text not null,
  year int not null,
  current_value int not null default 0,
  primary key (permit_type, year)
);

-- =========================================================
-- TRIGGERS: auto-update updated_at
-- =========================================================

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated
before update on public.users
for each row
execute function public.tg_set_updated_at();

create trigger permits_set_updated
before update on public.permits
for each row
execute function public.tg_set_updated_at();