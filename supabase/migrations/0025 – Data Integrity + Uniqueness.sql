-- Migration 0025: Data integrity + uniqueness hardening

-- Prevent invalid date range
alter table public.permits
add constraint permits_date_check
check (date_completion >= date_commencement);

-- Prevent duplicate daily endorsement per day
create unique index if not exists uniq_permit_day
on public.permit_endorsements (permit_id, day_number);

-- Prevent duplicate stage submission
create unique index if not exists uniq_permit_stage
on public.permit_stages (permit_id, stage);