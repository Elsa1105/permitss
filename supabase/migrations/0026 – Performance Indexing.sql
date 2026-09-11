-- Migration 0026: Performance indexing

create index if not exists idx_permits_state
on public.permits(state);

create index if not exists idx_permits_company_site
on public.permits(company_id, site_id);

create index if not exists idx_permits_dates
on public.permits(date_commencement, date_completion);

create index if not exists idx_endorsements_permit
on public.permit_endorsements(permit_id);

create index if not exists idx_endorsements_day
on public.permit_endorsements(day_number);