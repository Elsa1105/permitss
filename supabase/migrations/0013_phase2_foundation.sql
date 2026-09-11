-- =====================================================
-- Migration 0013: Phase 2 Foundation (FIXED FULL VERSION)
-- =====================================================

-- =====================================================
-- 1. Permit type registry for Phase 2 expansion
-- =====================================================

create table if not exists public.permit_types (
  code text primary key,
  name text not null,
  description text,
  active boolean not null default false,
  form_schema jsonb not null default '{}'::jsonb,
  workflow_schema jsonb not null default '{}'::jsonb,
  pdf_template_key text,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists permit_types_set_updated on public.permit_types;
create trigger permit_types_set_updated
before update on public.permit_types
for each row
execute function public.tg_set_updated_at();

insert into public.permit_types (code, name, description, active, display_order)
values
  ('hot_work_onshore', 'Hot Work Permit (Onshore)', 'FOI-SG-057 Hot Work Permit MVP.', true, 10),
  ('cold_work', 'Cold Work Permit', 'Future permit type placeholder.', false, 20),
  ('confined_space', 'Confined Space Entry Permit', 'Future permit type placeholder.', false, 30),
  ('working_at_height', 'Working at Height Permit', 'Future permit type placeholder.', false, 40),
  ('lifting_operation', 'Lifting Operation Permit', 'Future permit type placeholder.', false, 50),
  ('electrical_work', 'Electrical Work Permit', 'Future permit type placeholder.', false, 60),
  ('general_work', 'General Work Permit', 'Future permit type placeholder.', false, 70)
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active,
  display_order = excluded.display_order;

alter table public.permit_types enable row level security;

drop policy if exists "permit_types read authenticated" on public.permit_types;
create policy "permit_types read authenticated"
on public.permit_types
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "permit_types admin all" on public.permit_types;
create policy "permit_types admin all"
on public.permit_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =====================================================
-- 2. Notification foundation
-- =====================================================

create table if not exists public.notification_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, site_id, code)
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.notification_groups(id) on delete cascade,
  email text not null,
  display_name text,
  recipient_type text not null default 'to'
    check (recipient_type in ('to', 'cc', 'bcc')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, email, recipient_type)
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  permit_type text references public.permit_types(code),
  event_type text not null check (
    event_type in (
      'permit_submitted',
      'stage2_fit',
      'stage2_not_fit',
      'srm_approved',
      'srm_rejected',
      'permit_revoked',
      'daily_endorsement_due',
      'daily_endorsement_missed',
      'permit_expiring',
      'permit_expired',
      'permit_closed',
      'scope_changed',
      'incident_near_miss'
    )
  ),
  group_id uuid not null references public.notification_groups(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid references public.permits(id) on delete cascade,
  event_type text not null,
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_queue_status_idx
on public.notification_queue(status, queued_at);

create index if not exists notification_queue_permit_idx
on public.notification_queue(permit_id);

drop trigger if exists notification_groups_set_updated on public.notification_groups;
create trigger notification_groups_set_updated
before update on public.notification_groups
for each row execute function public.tg_set_updated_at();

drop trigger if exists notification_recipients_set_updated on public.notification_recipients;
create trigger notification_recipients_set_updated
before update on public.notification_recipients
for each row execute function public.tg_set_updated_at();

drop trigger if exists notification_rules_set_updated on public.notification_rules;
create trigger notification_rules_set_updated
before update on public.notification_rules
for each row execute function public.tg_set_updated_at();

alter table public.notification_groups enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_queue enable row level security;

drop policy if exists "notification_groups admin all" on public.notification_groups;
create policy "notification_groups admin all"
on public.notification_groups
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notification_recipients admin all" on public.notification_recipients;
create policy "notification_recipients admin all"
on public.notification_recipients
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notification_rules admin all" on public.notification_rules;
create policy "notification_rules admin all"
on public.notification_rules
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notification_queue admin all" on public.notification_queue;
create policy "notification_queue admin all"
on public.notification_queue
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =====================================================
-- 🔥 FIX PENTING: sites mungkin belum ada → SAFE GUARD
-- =====================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'sites') then

    insert into public.notification_groups (company_id, site_id, code, name, description)
    select c.id, s.id,
           'EPERMIT_DEFAULT',
           c.code || ' ePermit Default Notification Group',
           'Default Phase 2 notification group for ePermit events.'
    from public.companies c
    join public.sites s on s.company_id = c.id and s.code = 'MAIN'
    where c.code in ('FOI', 'CFE')
    on conflict (company_id, site_id, code)
    do update set
      name = excluded.name,
      description = excluded.description,
      active = true;

  end if;
end $$;

-- =====================================================
-- 3. Public TV / active permit display foundation
-- =====================================================

create table if not exists public.display_screens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  refresh_seconds integer not null default 30,
  public_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, site_id, code),
  unique (public_token)
);

drop trigger if exists display_screens_set_updated on public.display_screens;
create trigger display_screens_set_updated
before update on public.display_screens
for each row execute function public.tg_set_updated_at();

alter table public.display_screens enable row level security;

drop policy if exists "display_screens admin all" on public.display_screens;
create policy "display_screens admin all"
on public.display_screens
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =====================================================
-- 🔥 FIX: column public_view_enabled mungkin belum ada
-- =====================================================

alter table public.permits
add column if not exists public_view_enabled boolean default true;

create or replace function public.get_active_permits_for_display(
  p_public_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_site_id uuid;
  v_result jsonb;
begin
  select company_id, site_id
  into v_company_id, v_site_id
  from public.display_screens
  where public_token = p_public_token
    and active = true;

  if v_company_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
  into v_result
  from public.permits p
  where p.company_id = v_company_id
    and p.state in ('approved_active','pending_daily_endorsement','pending_closure')
    and coalesce(p.public_view_enabled, true) = true;

  return v_result;
end;
$$;

grant execute on function public.get_active_permits_for_display(uuid)
to anon, authenticated;

-- =====================================================
-- 4. HR / user sync foundation
-- =====================================================

alter table public.users
add column if not exists employee_no text,
add column if not exists external_ref text,
add column if not exists source_system text,
add column if not exists last_synced_at timestamptz;

create index if not exists users_employee_no_idx
on public.users(employee_no)
where employee_no is not null;

create index if not exists users_external_ref_idx
on public.users(external_ref)
where external_ref is not null;

-- =====================================================
-- 5. Retention policy foundation
-- =====================================================

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  permit_type text references public.permit_types(code),
  company_id uuid references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  retain_years integer,
  retain_indefinitely boolean not null default true,
  archive_after_years integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (permit_type, company_id, site_id)
);

drop trigger if exists retention_policies_set_updated on public.retention_policies;
create trigger retention_policies_set_updated
before update on public.retention_policies
for each row execute function public.tg_set_updated_at();

alter table public.retention_policies enable row level security;

drop policy if exists "retention_policies admin all" on public.retention_policies;
create policy "retention_policies admin all"
on public.retention_policies
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- SAFE insert (avoid crash if sites not exist)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'sites') then

    insert into public.retention_policies (
      permit_type,
      company_id,
      site_id,
      retain_indefinitely,
      active
    )
    select
      'hot_work_onshore',
      c.id,
      s.id,
      true,
      true
    from public.companies c
    join public.sites s on s.company_id = c.id and s.code = 'MAIN'
    where c.code in ('FOI', 'CFE')
    on conflict (permit_type, company_id, site_id)
    do update set
      retain_indefinitely = true,
      active = true;

  end if;
end $$;