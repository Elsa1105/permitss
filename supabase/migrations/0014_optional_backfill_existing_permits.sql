-- Migration 0014: OPTIONAL Backfill Existing Permits
-- DO NOT run blindly.
-- Use this only if you already have old permits with company_id/site_id = null.
--
-- Option A below assigns all old permits to CFE MAIN.
-- If some old permits belong to FOI, manually update them instead.

-- =====================================================
-- OPTION A: Backfill all existing null company/site permits to CFE MAIN
-- Uncomment only if this is correct for your data.
-- =====================================================

/*
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
*/

-- =====================================================
-- OPTION B: Example manual FOI backfill by serial number
-- Replace the serial numbers with actual FOI permit numbers.
-- =====================================================

/*
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
*/

-- =====================================================
-- Check remaining permits without company/site
-- =====================================================

select
  id,
  serial_no,
  permit_type,
  state,
  created_at
from public.permits
where company_id is null
   or site_id is null
order by created_at desc;
