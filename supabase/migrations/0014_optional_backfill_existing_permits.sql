-- =====================================================
-- Migration 0014: OPTIONAL Backfill Existing Permits (SAFE VERSION)
-- =====================================================

-- ⚠️ IMPORTANT:
-- Migration ini OPTIONAL
-- Jangan dijalankan kalau data kamu belum siap / belum ada permits lama

-- =====================================================
-- PRE-CHECK: pastikan companies & sites ada
-- =====================================================

-- (ini cuma helper check, tidak mengubah data)
select
  c.code as company_code,
  s.code as site_code
from public.companies c
left join public.sites s on s.company_id = c.id
order by c.code;

-- =====================================================
-- OPTION A: Backfill ke CFE MAIN (SAFE WRAPPED)
-- =====================================================

-- Uncomment kalau SEMUA permit lama milik CFE

/*
do $$
begin
  if exists (select 1 from public.sites where code = 'MAIN') then

    update public.permits p
    set
      company_id = c.id,
      site_id = s.id,
      updated_at = now()
    from public.companies c
    join public.sites s on s.company_id = c.id and s.code = 'MAIN'
    where c.code = 'CFE'
      and p.company_id is null
      and p.site_id is null;

  else
    raise notice 'Sites table or MAIN site not found. Skipping backfill.';
  end if;
end $$;
*/

-- =====================================================
-- OPTION B: Backfill FOI manual (SAFE)
-- =====================================================

/*
do $$
begin
  if exists (select 1 from public.sites where code = 'MAIN') then

    update public.permits p
    set
      company_id = c.id,
      site_id = s.id,
      updated_at = now()
    from public.companies c
    join public.sites s on s.company_id = c.id and s.code = 'MAIN'
    where c.code = 'FOI'
      and p.serial_no in (
        'FOI-HWP-2026-001',
        'FOI-HWP-2026-002'
      );

  else
    raise notice 'Sites table or MAIN site not found. Skipping FOI backfill.';
  end if;
end $$;
*/

-- =====================================================
-- CHECK: Remaining permits without company/site
-- =====================================================

select
  id,
  serial_no,
  permit_type,
  state,
  company_id,
  site_id,
  created_at
from public.permits
where company_id is null
   or site_id is null
order by created_at desc;

-- =====================================================
-- OPTIONAL: COUNT summary (biar gampang cek)
-- =====================================================

select
  count(*) as total_missing
from public.permits
where company_id is null
   or site_id is null;