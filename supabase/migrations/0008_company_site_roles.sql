-- =====================================================
-- 0008 FINAL — SITE SCOPED (SAFE VERSION)
-- =====================================================

-- =====================================================
-- 1. COMPANIES (NO CHANGE)
-- =====================================================
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 2. SITES
-- =====================================================
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

-- =====================================================
-- 3. USER SITE ROLES
-- =====================================================
create table if not exists public.user_site_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, site_id, role)
);

-- =====================================================
-- 4. ADD SITE COLUMN ONLY (company sudah ada)
-- =====================================================
alter table public.permits
add column if not exists site_id uuid references public.sites(id);

-- =====================================================
-- 5. HELPER: HAS SITE ROLE
-- =====================================================
create or replace function public.has_site_role(
  p_company_id uuid,
  p_site_id uuid,
  p_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_site_roles usr
    where usr.user_id = auth.uid()
      and usr.company_id = p_company_id
      and usr.site_id = p_site_id
      and usr.role = p_role
      and usr.active = true
  );
$$;

-- =====================================================
-- 6. SAFE VIEW PERMIT (🔥 FIXED)
-- =====================================================
create or replace function public.can_view_permit_site(
  p_permit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.permits p
    where p.id = p_permit_id
      and (
        public.is_admin()

        -- direct ownership
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()

        -- assessor stage access
        or (
          public.has_role('assessor')
          and p.state = 'pending_safety_assessment'
        )

        -- srm workflow access
        or (
          public.has_role('srm')
          and p.state in (
            'draft',
            'pending_safety_assessment',
            'pending_srm_approval',
            'approved_active',
            'pending_daily_endorsement',
            'pending_closure'
          )
        )

        -- site role access (🔥 LIMITED)
        or (
          p.company_id is not null
          and p.site_id is not null
          and exists (
            select 1
            from public.user_site_roles usr
            where usr.user_id = auth.uid()
              and usr.company_id = p.company_id
              and usr.site_id = p.site_id
              and usr.active = true
          )
        )
      )
  );
$$;

-- =====================================================
-- 7. CREATE PERMIT (🔥 STRICT)
-- =====================================================
create or replace function public.can_create_permit_for_site(
  p_company_id uuid,
  p_site_id uuid
)
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
      and p_company_id is not null
      and p_site_id is not null
      and (
        public.is_admin()
        or public.has_site_role(p_company_id, p_site_id, 'applicant')
        or public.has_site_role(p_company_id, p_site_id, 'guest_applicant')
        or public.has_site_role(p_company_id, p_site_id, 'contractor')
        or public.has_site_role(p_company_id, p_site_id, 'srm')
      )
  );
$$;

-- =====================================================
-- 8. RLS PERMITS (FINAL)
-- =====================================================

drop policy if exists permits_read on public.permits;

create policy permits_read
on public.permits
for select
to authenticated
using (
  public.can_view_permit_site(id)
);

drop policy if exists permits_insert_draft on public.permits;

create policy permits_insert_draft
on public.permits
for insert
to authenticated
with check (
  applicant_id = auth.uid()
  and company_id is not null
  and site_id is not null
  and state = 'draft'
  and public.can_create_permit_for_site(company_id, site_id)
);