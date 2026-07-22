-- Ensure the Job Type column exists in production before permit creation.
alter table public.permits add column if not exists job_type text;

update public.permits
set job_type = 'Hot Work'
where job_type is null or trim(job_type) = '';

create index if not exists idx_permits_job_type on public.permits (job_type);
