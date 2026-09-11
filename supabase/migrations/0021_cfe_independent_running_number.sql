-- Migration 0021: Add job_type to permits

-- =====================================================
-- 1. Add column
-- =====================================================

alter table public.permits
add column if not exists job_type text;

-- =====================================================
-- 2. Backfill existing data
-- =====================================================

update public.permits
set job_type = 'Hot Work'
where job_type is null
   or trim(job_type) = '';

-- =====================================================
-- 3. Optional: enforce default for new records
-- =====================================================

alter table public.permits
alter column job_type set default 'Hot Work';

-- =====================================================
-- 4. Index for filtering
-- =====================================================

create index if not exists idx_permits_job_type
on public.permits (job_type);