-- =========================================================
-- Migration 0010: Strict Day 2-14 SRM Daily Endorsement Validation (FIXED)
-- =========================================================

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

  v_company_id uuid;
  v_site_id uuid;

  v_commencement date;
  v_completion date;

  v_total_days integer;
  v_max_day integer;

  v_target_date date;
  v_today integer;

  v_existing int;
  v_missing_prev int;

  v_audit public.audit_action;
begin
  -- =========================================================
  -- AUTH USER
  -- =========================================================
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select role, active, qualified_for
  into v_user_role, v_user_active, v_user_qualified_for
  from public.users
  where id = v_user_id;

  if v_user_role is null then
    raise exception 'User profile not found';
  end if;

  if v_user_active is not true then
    raise exception 'User inactive';
  end if;

  -- =========================================================
  -- VALIDATE INPUT
  -- =========================================================
  if p_day < 2 or p_day > 14 then
    raise exception 'Day must be between 2–14';
  end if;

  if p_action in ('reject','revoke')
     and length(trim(coalesce(p_remarks,''))) = 0 then
    raise exception 'Remarks required for reject/revoke';
  end if;

  -- =========================================================
  -- LOCK PERMIT
  -- =========================================================
  select
    state,
    company_id,
    site_id,
    date_commencement,
    date_completion
  into
    v_from_state,
    v_company_id,
    v_site_id,
    v_commencement,
    v_completion
  from public.permits
  where id = p_permit_id
  for update;

  if v_from_state is null then
    raise exception 'Permit not found';
  end if;

  -- =========================================================
  -- AUTHORIZATION (SRM / ADMIN)
  -- =========================================================
  if not (
    public.is_admin()
    or public.has_site_role(v_company_id, v_site_id, 'srm')
    or (
      (v_company_id is null or v_site_id is null)
      and v_user_role = 'srm'
      and 'hot_work_srm' = any(coalesce(v_user_qualified_for, array[]::text[]))
    )
  ) then
    raise exception 'Only SRM allowed';
  end if;

  if v_from_state not in ('approved_active','pending_daily_endorsement') then
    raise exception 'Permit not active (state: %)', v_from_state;
  end if;

  -- =========================================================
  -- DATE VALIDATION
  -- =========================================================
  if v_commencement is null or v_completion is null then
    raise exception 'Missing dates';
  end if;

  if v_completion < v_commencement then
    raise exception 'Invalid date range';
  end if;

  v_total_days := (v_completion - v_commencement) + 1;

  if v_total_days <= 1 then
    raise exception 'Single-day permit does not need endorsement';
  end if;

  v_max_day := least(v_total_days, 14);

  if p_day > v_max_day then
    raise exception 'Max endorsement day is %', v_max_day;
  end if;

  v_target_date := v_commencement + (p_day - 1);
  v_today := (current_date - v_commencement) + 1;

  if current_date < v_target_date then
    raise exception 'Cannot endorse future day (% on %)', p_day, v_target_date;
  end if;

  if current_date > v_target_date then
    raise exception 'Cannot backdate endorsement (% expected on %)', p_day, v_target_date;
  end if;

  if p_day <> v_today then
    raise exception 'Today is Day %, not Day %', v_today, p_day;
  end if;

  -- =========================================================
  -- DUPLICATE CHECK
  -- =========================================================
  select count(*) into v_existing
  from public.permit_endorsements
  where permit_id = p_permit_id
    and day_number = p_day;

  if v_existing > 0 then
    raise exception 'Day % already endorsed', p_day;
  end if;

  -- =========================================================
  -- SEQUENTIAL CHECK
  -- =========================================================
  if p_day > 2 then
    select count(*) into v_missing_prev
    from generate_series(2, p_day - 1) d
    where not exists (
      select 1
      from public.permit_endorsements pe
      where pe.permit_id = p_permit_id
        and pe.day_number = d
        and pe.action = 'continue'
    );

    if v_missing_prev > 0 then
      raise exception 'Previous days must be completed';
    end if;
  end if;

  -- =========================================================
  -- INSERT ENDORSEMENT
  -- =========================================================
  insert into public.permit_endorsements (
    permit_id,
    day_number,
    endorser_id,
    action,
    remarks
  )
  values (
    p_permit_id,
    p_day,
    v_user_id,
    p_action,
    nullif(trim(coalesce(p_remarks,'')),'')
  );

  -- =========================================================
  -- STATE TRANSITION
  -- =========================================================
  if p_action = 'continue' then
    if p_day >= v_max_day then
      v_to_state := 'pending_closure';
    else
      v_to_state := 'pending_daily_endorsement';
    end if;

    v_audit := 'endorsed_continue';

  elsif p_action = 'reject' then
    v_to_state := 'revoked';
    v_audit := 'endorsed_reject';

  else
    v_to_state := 'revoked';
    v_audit := 'endorsed_revoke';
  end if;

  update public.permits
  set state = v_to_state,
      updated_at = now()
  where id = p_permit_id;

  -- =========================================================
  -- AUDIT
  -- =========================================================
  perform public.write_audit(
    p_permit_id,
    v_audit,
    v_user_id,
    jsonb_build_object(
      'day', p_day,
      'action', p_action,
      'remarks', p_remarks
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day', p_day,
    'action', p_action,
    'state', v_to_state
  );
end;
$$;