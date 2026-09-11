-- Migration 0016: Alex Lim dashboard / Job Type / SRM leave coverage updates
--
-- Client requests dated 9 July 2026:
-- 1. Add Job Type to permit application and dashboard.
-- 2. Allow any authorised SRM for the same site to perform Day 2-14
--    endorsements when another SRM is on leave.
--
-- Dashboard search/sorting and Stage III wording are application-code changes.

-- =====================================================
-- 1. Job Type
-- =====================================================

alter table public.permits
add column if not exists job_type text;

update public.permits
set job_type = 'Hot Work'
where job_type is null or trim(job_type) = '';

create index if not exists idx_permits_job_type
on public.permits (job_type);

comment on column public.permits.job_type is
'Applicant-entered type of job/work, displayed as the second dashboard column.';

-- =====================================================
-- 2. Any authorised SRM for the permit site may act
-- =====================================================

create or replace function public.can_act_as_srm_for_permit(
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
    join public.users u on u.id = auth.uid()
    where p.id = p_permit_id
      and u.active = true
      and (
        u.role = 'admin'

        or (
          p.company_id is not null
          and p.site_id is not null
          and exists (
            select 1
            from public.user_site_roles usr
            where usr.user_id = u.id
              and usr.company_id = p.company_id
              and usr.site_id = p.site_id
              and usr.role = 'srm'
              and usr.active = true
          )
        )

        or (
          (
            u.role = 'srm'
            or 'hot_work_srm' = any(coalesce(u.qualified_for, array[]::text[]))
          )
          and (
            p.company_id is null
            or p.site_id is null
            or not exists (
              select 1
              from public.user_site_roles configured_srm
              where configured_srm.company_id = p.company_id
                and configured_srm.site_id = p.site_id
                and configured_srm.role = 'srm'
                and configured_srm.active = true
            )
          )
        )
      )
  );
$$;

-- =====================================================
-- 2b. Visibility helper (IMPORTANT for dashboard)
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
        or public.can_act_as_srm_for_permit(p.id)

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
-- 3. Recreate daily endorsement with SRM coverage
-- =====================================================

drop function if exists public.permit_endorse_day(
  uuid,
  integer,
  public.endorsement_action,
  text
);

create or replace function public.permit_endorse_day(
  p_permit_id uuid,
  p_day integer,
  p_action public.endorsement_action,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role public.user_role;
  v_user_active boolean;
  v_user_qualified_for text[];

  v_from_state public.permit_state;
  v_to_state public.permit_state;
  v_audit_action public.audit_action;

  v_company_id uuid;
  v_site_id uuid;

  v_commencement date;
  v_completion date;
  v_total_days integer;
  v_max_endorsement_day integer;
  v_target_date date;
  v_today date;
  v_current_day integer;

  v_missing_previous_days integer;
  v_existing_count integer;

  v_clean_remarks text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  v_today := timezone('Asia/Singapore', now())::date;
  v_clean_remarks := nullif(trim(coalesce(p_remarks, '')), '');

  select
    u.role,
    u.active,
    coalesce(u.qualified_for, array[]::text[])
  into
    v_user_role,
    v_user_active,
    v_user_qualified_for
  from public.users u
  where u.id = v_user_id;

  if v_user_role is null then
    raise exception 'User profile not found';
  end if;

  if v_user_active is not true then
    raise exception 'User account is inactive';
  end if;

  if p_day < 2 or p_day > 14 then
    raise exception 'Daily endorsement day must be between Day 2 and Day 14';
  end if;

  if p_action in ('reject', 'revoke') and v_clean_remarks is null then
    raise exception 'Remarks are required for reject/revoke endorsement';
  end if;

  select
    p.state,
    p.company_id,
    p.site_id,
    p.date_commencement::date,
    p.date_completion::date
  into
    v_from_state,
    v_company_id,
    v_site_id,
    v_commencement,
    v_completion
  from public.permits p
  where p.id = p_permit_id
  for update;

  if v_from_state is null then
    raise exception 'Permit not found';
  end if;

  if not public.can_act_as_srm_for_permit(p_permit_id) then
    raise exception 'Only authorised SRM for this site can endorse';
  end if;

  if v_from_state not in ('approved_active', 'pending_daily_endorsement') then
    raise exception 'Permit is not active for daily endorsement. Current state: %', v_from_state;
  end if;

  if v_commencement is null or v_completion is null then
    raise exception 'Permit dates are required';
  end if;

  if v_completion < v_commencement then
    raise exception 'Invalid permit date range';
  end if;

  v_total_days := (v_completion - v_commencement) + 1;

  if v_total_days <= 1 then
    raise exception 'Single-day permits do not require endorsement';
  end if;

  v_max_endorsement_day := least(v_total_days, 14);

  if p_day > v_max_endorsement_day then
    raise exception 'Invalid endorsement day';
  end if;

  v_target_date := v_commencement + (p_day - 1);
  v_current_day := (v_today - v_commencement) + 1;

  if v_today <> v_target_date then
    raise exception 'Endorsement must be done on the correct day';
  end if;

  select count(*)
  into v_existing_count
  from public.permit_endorsements
  where permit_id = p_permit_id
    and day_number = p_day;

  if v_existing_count > 0 then
    raise exception 'Already endorsed';
  end if;

  insert into public.permit_endorsements (
    permit_id,
    day_number,
    endorser_id,
    action,
    remarks,
    ts
  )
  values (
    p_permit_id,
    p_day,
    v_user_id,
    p_action,
    v_clean_remarks,
    now()
  );

  if p_action = 'continue' then
    if p_day >= v_max_endorsement_day then
      v_to_state := 'pending_closure';
    else
      v_to_state := 'pending_daily_endorsement';
    end if;

    v_audit_action := 'endorsed_continue';

  elsif p_action = 'reject' then
    v_to_state := 'revoked';
    v_audit_action := 'endorsed_reject';

  else
    v_to_state := 'revoked';
    v_audit_action := 'endorsed_revoke';
  end if;

  update public.permits
  set state = v_to_state,
      updated_at = now()
  where id = p_permit_id;

  perform public.write_audit(
  p_permit_id,
  v_audit_action,
  v_from_state,
  v_to_state,
  v_clean_remarks,
  jsonb_build_object(
    'day_number', p_day,
    'action', p_action::text,
    'remarks', v_clean_remarks,
    'target_date', v_target_date,
    'today_singapore', v_today,
    'current_day', v_current_day,
    'total_days', v_total_days,
    'max_endorsement_day', v_max_endorsement_day
  )
);

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day_number', p_day,
    'action', p_action::text,
    'from_state', v_from_state::text,
    'to_state', v_to_state::text
  );
end;
$$;