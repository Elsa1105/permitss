-- Migration 0007: Guest Applicant / Contractor Workflow
-- NOTE:
-- user_role enum values 'guest_applicant' and 'contractor'
-- already exist in 0001_init.sql.
-- Do not use users_role_check because users.role uses enum public.user_role.

-- =====================================================
-- 1. Add contractor / guest fields to permits
-- =====================================================

alter table public.permits
add column if not exists contractor_company text,
add column if not exists contractor_supervisor_name text,
add column if not exists contractor_supervisor_registration_no text,
add column if not exists worker_briefing_acknowledged boolean not null default false,
add column if not exists top_controls_summary text;

-- =====================================================
-- 2. Helper: check guest applicant / contractor
-- =====================================================

create or replace function public.is_guest_applicant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.active = true
      and u.role in ('guest_applicant', 'contractor')
  );
$$;

-- =====================================================
-- 3. Helper: who can create permit
-- =====================================================

create or replace function public.can_create_permit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.active = true
      and u.role in (
        'applicant',
        'guest_applicant',
        'contractor',
        'admin',
        'srm'
      )
  );
$$;

-- =====================================================
-- 4. Update permits insert policy
-- =====================================================

drop policy if exists "permits insert applicant admin" on public.permits;
drop policy if exists "permits_insert_applicant_admin" on public.permits;
drop policy if exists "permits insert applicant guest admin" on public.permits;
drop policy if exists "permits insert site scoped" on public.permits;

create policy "permits insert applicant guest admin"
on public.permits
for insert
to authenticated
with check (
  public.can_create_permit()
  and applicant_id = auth.uid()
);

-- =====================================================
-- 5. Update permits read policy
-- =====================================================

drop policy if exists "permits read involved parties" on public.permits;
drop policy if exists "permits_select_involved_parties" on public.permits;
drop policy if exists "permits read involved applicant guest" on public.permits;
drop policy if exists "permits read involved site scoped" on public.permits;

create policy "permits read involved applicant guest"
on public.permits
for select
to authenticated
using (
  public.is_admin()
  or applicant_id = auth.uid()
  or assessor_id = auth.uid()
  or srm_id = auth.uid()
  or closer_id = auth.uid()
  or public.has_role('assessor')
  or public.has_role('srm')
);

-- =====================================================
-- 6. Update permits update policy
-- =====================================================

drop policy if exists "permits update involved parties" on public.permits;
drop policy if exists "permits_update_involved_parties" on public.permits;
drop policy if exists "permits update involved applicant guest" on public.permits;

create policy "permits update involved applicant guest"
on public.permits
for update
to authenticated
using (
  public.is_admin()
  or applicant_id = auth.uid()
  or assessor_id = auth.uid()
  or srm_id = auth.uid()
  or closer_id = auth.uid()
  or public.has_role('assessor')
  or public.has_role('srm')
)
with check (
  public.is_admin()
  or applicant_id = auth.uid()
  or assessor_id = auth.uid()
  or srm_id = auth.uid()
  or closer_id = auth.uid()
  or public.has_role('assessor')
  or public.has_role('srm')
);