-- Migration 0008: Company / Site Filtering and Site-Scoped Roles

-- =====================================================
-- 0. Ensure enum roles exist
-- =====================================================

alter type public.user_role add value if not exists 'guest_applicant';
alter type public.user_role add value if not exists 'contractor';

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
-- 3. User Site Roles
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
-- 4. Add company/site columns to permits
-- =====================================================

alter table public.permits
add column if not exists company_id uuid references public.companies(id),
add column if not exists site_id uuid references public.sites(id);

-- =====================================================
-- 5. Seed companies
-- =====================================================

insert into public.companies (code, name, active)
values
  ('FOI', 'Franklin Offshore International', true),
  ('CFE', 'CFE', true)
on conflict (code)
do update set
  name = excluded.name,
  active = true;

-- =====================================================
-- 6. Seed MAIN sites
-- =====================================================

insert into public.sites (company_id, code, name, active)
select
  c.id,
  'MAIN',
  case
    when c.code = 'FOI' then 'FOI Main Site'
    when c.code = 'CFE' then 'CFE Main Site'
  end,
  true
from public.companies c
where c.code in ('FOI', 'CFE')
on conflict (company_id, code)
do update set
  name = excluded.name,
  active = true;

-- =====================================================
-- 7. Indexes
-- =====================================================

create index if not exists idx_sites_company_id
on public.sites(company_id);

create index if not exists idx_user_site_roles_user_company_site_role
on public.user_site_roles(user_id, company_id, site_id, role)
where active = true;

create index if not exists idx_user_site_roles_company_site_role
on public.user_site_roles(company_id, site_id, role)
where active = true;

create index if not exists idx_permits_company_site
on public.permits(company_id, site_id);

-- =====================================================
-- 8. Helper: has_site_role
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
-- 9. Helper: can view permit by site
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
-- 10. Helper: can create permit for site
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
        or u.role in ('applicant', 'guest_applicant', 'contractor', 'admin', 'srm')
      )
  );
$$;

-- =====================================================
-- 11. Permits RLS policies
-- =====================================================

drop policy if exists "permits read involved applicant guest" on public.permits;
drop policy if exists "permits read involved site scoped" on public.permits;

create policy "permits read involved site scoped"
on public.permits
for select
to authenticated
using (
  public.can_view_permit_site(id)
);

drop policy if exists "permits insert applicant guest admin" on public.permits;
drop policy if exists "permits insert site scoped" on public.permits;

create policy "permits insert site scoped"
on public.permits
for insert
to authenticated
with check (
  applicant_id = auth.uid()
  and company_id is not null
  and site_id is not null
  and public.can_create_permit_for_site(company_id, site_id)
);

-- =====================================================
-- 12. Enable RLS
-- =====================================================

alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.user_site_roles enable row level security;

-- =====================================================
-- 13. Companies policies
-- =====================================================

drop policy if exists "companies read authenticated" on public.companies;
create policy "companies read authenticated"
on public.companies
for select
to authenticated
using (
  active = true
  or public.is_admin()
);

drop policy if exists "companies admin insert" on public.companies;
create policy "companies admin insert"
on public.companies
for insert
to authenticated
with check (
  public.is_admin()
);

drop policy if exists "companies admin update" on public.companies;
create policy "companies admin update"
on public.companies
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists "companies admin delete" on public.companies;
create policy "companies admin delete"
on public.companies
for delete
to authenticated
using (
  public.is_admin()
);

-- =====================================================
-- 14. Sites policies
-- =====================================================

drop policy if exists "sites read authenticated" on public.sites;
create policy "sites read authenticated"
on public.sites
for select
to authenticated
using (
  active = true
  or public.is_admin()
);

drop policy if exists "sites admin insert" on public.sites;
create policy "sites admin insert"
on public.sites
for insert
to authenticated
with check (
  public.is_admin()
);

drop policy if exists "sites admin update" on public.sites;
create policy "sites admin update"
on public.sites
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists "sites admin delete" on public.sites;
create policy "sites admin delete"
on public.sites
for delete
to authenticated
using (
  public.is_admin()
);

-- =====================================================
-- 15. User site roles policies
-- =====================================================

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
with check (
  public.is_admin()
);

drop policy if exists "user_site_roles admin update" on public.user_site_roles;
create policy "user_site_roles admin update"
on public.user_site_roles
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists "user_site_roles admin delete" on public.user_site_roles;
create policy "user_site_roles admin delete"
on public.user_site_roles
for delete
to authenticated
using (
  public.is_admin()
);