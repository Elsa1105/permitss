-- =====================================================
-- 0007 GUEST / CONTRACTOR (FIXED + SECURE)
-- =====================================================

-- =====================================================
-- 1. ADD FIELDS
-- =====================================================
alter table public.permits
add column if not exists contractor_company text,
add column if not exists contractor_supervisor_name text,
add column if not exists contractor_supervisor_registration_no text,
add column if not exists worker_briefing_acknowledged boolean not null default false,
add column if not exists top_controls_summary text;

-- =====================================================
-- 2. HELPER: GUEST / CONTRACTOR
-- =====================================================
create or replace function public.is_guest_applicant()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and active = true
      and role in ('guest_applicant','contractor')
  );
$$;

-- =====================================================
-- 3. HELPER: CAN CREATE
-- =====================================================
create or replace function public.can_create_permit()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and active = true
      and role in (
        'applicant',
        'guest_applicant',
        'contractor',
        'admin',
        'srm'
      )
  );
$$;

-- =====================================================
-- 4. INSERT POLICY (🔥 FIX COMPANY)
-- =====================================================
drop policy if exists permits_insert_draft on public.permits;

create policy permits_insert_draft
on public.permits
for insert
to authenticated
with check (
  public.can_create_permit()
  and applicant_id = auth.uid()
  and state = 'draft'
  and company_id = public.get_user_company() -- 🔥 IMPORTANT
);

-- =====================================================
-- 5. READ POLICY (🔥 FIX SEGREGATION)
-- =====================================================
drop policy if exists permits_read on public.permits;

create policy permits_read
on public.permits
for select
to authenticated
using (
  company_id = public.get_user_company() -- 🔥 WAJIB
  and (
    public.is_admin()

    or applicant_id = auth.uid()
    or assessor_id = auth.uid()
    or srm_id = auth.uid()
    or closer_id = auth.uid()

    or (
      public.has_role('assessor')
      and state = 'pending_safety_assessment'
    )

    or (
      public.has_role('srm')
      and state in (
        'draft',
        'pending_safety_assessment',
        'pending_srm_approval',
        'approved_active',
        'pending_daily_endorsement',
        'pending_closure'
      )
    )
  )
);

-- =====================================================
-- 6. UPDATE POLICY (🔥 STRICT)
-- =====================================================
drop policy if exists permits_update_draft on public.permits;

create policy permits_update_draft
on public.permits
for update
to authenticated
using (
  state = 'draft'
  and company_id = public.get_user_company()
  and (
    applicant_id = auth.uid()
    or public.has_role('srm')
    or public.is_admin()
  )
)
with check (
  state = 'draft'
  and company_id = public.get_user_company()
  and (
    applicant_id = auth.uid()
    or public.has_role('srm')
    or public.is_admin()
  )
);