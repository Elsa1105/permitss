-- =========================================================
-- 1. COMPANIES (FIX + SAFE INSERT)
-- =========================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- pastikan unique
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_code_unique'
  ) then
    alter table public.companies
    add constraint companies_code_unique unique (code);
  end if;
end $$;

-- insert FOI
insert into public.companies (code, name)
values ('FOI', 'Franklin Offshore')
on conflict (code) do nothing;

-- insert CFE
insert into public.companies (code, name)
values ('CFE', 'CFE Engineering')
on conflict (code) do nothing;

-- =========================================================
-- 2. ADD COMPANY COLUMN
-- =========================================================

alter table public.users
add column if not exists company_id uuid references public.companies(id);

alter table public.permits
add column if not exists company_id uuid references public.companies(id);

-- =========================================================
-- 3. ENABLE RLS
-- =========================================================

alter table public.users               enable row level security;
alter table public.permits             enable row level security;
alter table public.permit_stages       enable row level security;
alter table public.permit_endorsements enable row level security;
alter table public.permit_photos       enable row level security;
alter table public.audit_log           enable row level security;
alter table public.permit_counters     enable row level security;

-- =========================================================
-- 4. HELPER FUNCTION
-- =========================================================

create or replace function public.get_user_company()
returns uuid
language sql
stable
as $$
  select company_id from public.users where id = auth.uid();
$$;

-- =========================================================
-- 5. USERS
-- =========================================================

drop policy if exists users_select_all on public.users;
create policy users_select_all
on public.users for select
to authenticated
using (true);

drop policy if exists users_self_update on public.users;
create policy users_self_update
on public.users for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.users where id = auth.uid())
  and qualified_for = (select qualified_for from public.users where id = auth.uid())
  and active = (select active from public.users where id = auth.uid())
);

drop policy if exists users_admin_all on public.users;
create policy users_admin_all
on public.users for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================================================
-- 6. PERMITS (WITH FOI/CFE SEGREGATION)
-- =========================================================

drop policy if exists permits_read on public.permits;

create policy permits_read
on public.permits for select
to authenticated
using (
  company_id = public.get_user_company()
  and (
    public.is_admin()
    or applicant_id = auth.uid()
    or assessor_id  = auth.uid()
    or srm_id       = auth.uid()
    or closer_id    = auth.uid()

    or (public.has_role('assessor') and state = 'pending_safety_assessment')

    or (
      public.has_role('srm')
      and state in (
        'pending_srm_approval',
        'approved_active',
        'pending_daily_endorsement',
        'pending_closure'
      )
    )
  )
);

drop policy if exists permits_insert_draft on public.permits;

create policy permits_insert_draft
on public.permits for insert
to authenticated
with check (
  applicant_id = auth.uid()
  and state = 'draft'
  and company_id = public.get_user_company()
  and (public.has_role('applicant') or public.is_admin())
);

drop policy if exists permits_update_draft on public.permits;

create policy permits_update_draft
on public.permits for update
to authenticated
using (
  state = 'draft'
  and company_id = public.get_user_company()
  and (applicant_id = auth.uid() or public.is_admin())
)
with check (
  state = 'draft'
  and company_id = public.get_user_company()
  and (applicant_id = auth.uid() or public.is_admin())
);

drop policy if exists permits_delete_draft on public.permits;

create policy permits_delete_draft
on public.permits for delete
to authenticated
using (
  state = 'draft'
  and company_id = public.get_user_company()
  and applicant_id = auth.uid()
);

-- =========================================================
-- 7. PERMIT STAGES
-- =========================================================

drop policy if exists permit_stages_read on public.permit_stages;

create policy permit_stages_read
on public.permit_stages for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and (
      p.applicant_id = auth.uid()
      or p.assessor_id = auth.uid()
      or p.srm_id = auth.uid()
      or p.closer_id = auth.uid()
    )
  )
);

drop policy if exists permit_stages_no_direct_write on public.permit_stages;

create policy permit_stages_no_direct_write
on public.permit_stages for all
to authenticated
using (false)
with check (false);

-- =========================================================
-- 8. ENDORSEMENTS
-- =========================================================

drop policy if exists permit_endorsements_read on public.permit_endorsements;

create policy permit_endorsements_read
on public.permit_endorsements for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and (
      p.applicant_id = auth.uid()
      or p.assessor_id = auth.uid()
      or p.srm_id = auth.uid()
      or p.closer_id = auth.uid()
    )
  )
);

drop policy if exists permit_endorsements_no_direct_write on public.permit_endorsements;

create policy permit_endorsements_no_direct_write
on public.permit_endorsements for all
to authenticated
using (false)
with check (false);

-- =========================================================
-- 9. PHOTOS
-- =========================================================

drop policy if exists permit_photos_read on public.permit_photos;

create policy permit_photos_read
on public.permit_photos for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and (
      p.applicant_id = auth.uid()
      or p.assessor_id = auth.uid()
      or p.srm_id = auth.uid()
      or p.closer_id = auth.uid()
    )
  )
);

drop policy if exists permit_photos_insert on public.permit_photos;

create policy permit_photos_insert
on public.permit_photos for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and (
      (p.applicant_id = auth.uid() and p.state in ('draft','pending_safety_assessment'))
      or public.is_admin()
    )
  )
);

drop policy if exists permit_photos_delete_own on public.permit_photos;

create policy permit_photos_delete_own
on public.permit_photos for delete
to authenticated
using (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and p.state = 'draft'
  )
);

-- =========================================================
-- 10. AUDIT LOG
-- =========================================================

drop policy if exists audit_log_read on public.audit_log;

create policy audit_log_read
on public.audit_log for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.permits p
    where p.id = permit_id
    and p.company_id = public.get_user_company()
    and (
      p.applicant_id = auth.uid()
      or p.assessor_id = auth.uid()
      or p.srm_id = auth.uid()
      or p.closer_id = auth.uid()
    )
  )
);

drop policy if exists audit_log_no_direct_write on public.audit_log;
create policy audit_log_no_direct_write
on public.audit_log for insert
to authenticated
with check (false);

drop policy if exists audit_log_no_update on public.audit_log;
create policy audit_log_no_update
on public.audit_log for update
to authenticated
using (false)
with check (false);

drop policy if exists audit_log_no_delete on public.audit_log;
create policy audit_log_no_delete
on public.audit_log for delete
to authenticated
using (false);

-- =========================================================
-- 11. COUNTERS
-- =========================================================

drop policy if exists permit_counters_no_direct on public.permit_counters;

create policy permit_counters_no_direct
on public.permit_counters for all
to authenticated
using (false)
with check (false);