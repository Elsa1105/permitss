-- Migration 0008: Company / Site Filtering and Site-Scoped Roles

-- =====================================================
-- 1. Companies
-- =====================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 2. Sites
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
-- 3. User company/site roles
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
-- 4. Add company/site to permits
-- =====================================================

alter table public.permits
add column if not exists company_id uuid references public.companies(id),
add column if not exists site_id uuid references public.sites(id);

-- =====================================================
-- 5. Seed default company/site
-- =====================================================

insert into public.companies (code, name)
values
  ('FOI', 'Franklin Offshore International'),
  ('CFE', 'CFE')
on conflict (code) do nothing;

insert into public.sites (company_id, code, name)
select c.id, 'MAIN', c.name || ' Main Site'
from public.companies c
where c.code in ('FOI', 'CFE')
on conflict (company_id, code) do nothing;

-- =====================================================
-- 6. Helper: user has role for permit site
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
-- 7. Helper: user can view permit by company/site
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
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()
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
-- 8. Helper: user can create permit for site
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
      and (
        u.role in ('applicant', 'guest_applicant', 'contractor', 'admin', 'srm')
        or public.has_site_role(p_company_id, p_site_id, 'applicant')
        or public.has_site_role(p_company_id, p_site_id, 'guest_applicant')
        or public.has_site_role(p_company_id, p_site_id, 'contractor')
        or public.has_site_role(p_company_id, p_site_id, 'srm')
      )
  );
$$;

-- =====================================================
-- 9. Update permit RLS read policy
-- =====================================================

drop policy if exists "permits read involved applicant guest" on public.permits;
drop policy if exists "permits read involved site scoped" on public.permits;

create policy "permits read involved site scoped"
on public.permits
for select
to authenticated
using (
  public.is_admin()
  or applicant_id = auth.uid()
  or assessor_id = auth.uid()
  or srm_id = auth.uid()
  or closer_id = auth.uid()
  or public.can_view_permit_site(id)
);

-- =====================================================
-- 10. Update permit insert policy
-- =====================================================

drop policy if exists "permits insert applicant guest admin" on public.permits;
drop policy if exists "permits insert site scoped" on public.permits;

create policy "permits insert site scoped"
on public.permits
for insert
to authenticated
with check (
  applicant_id = auth.uid()
  and (
    public.is_admin()
    or public.can_create_permit()
    or public.can_create_permit_for_site(company_id, site_id)
  )
);

-- =====================================================
-- 11. Read policies for companies/sites/user_site_roles
-- =====================================================

alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.user_site_roles enable row level security;

drop policy if exists "companies read authenticated" on public.companies;
create policy "companies read authenticated"
on public.companies
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "sites read authenticated" on public.sites;
create policy "sites read authenticated"
on public.sites
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "user_site_roles read own admin" on public.user_site_roles;
create policy "user_site_roles read own admin"
on public.user_site_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "user_site_roles admin insert" on public.user_site_roles;
create policy "user_site_roles admin insert"
on public.user_site_roles
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "user_site_roles admin update" on public.user_site_roles;
create policy "user_site_roles admin update"
on public.user_site_roles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "user_site_roles admin delete" on public.user_site_roles;
create policy "user_site_roles admin delete"
on public.user_site_roles
for delete
to authenticated
using (public.is_admin());