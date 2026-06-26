-- Migration 0010: Strict Day 2-14 SRM Daily Endorsement Validation

drop function if exists public.permit_endorse_day(
  uuid,
  integer,
  public.endorsement_action,
  text
);

create function public.permit_endorse_day(
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

  v_from_state text;
  v_to_state text;

  v_commencement date;
  v_completion date;
  v_total_days integer;
  v_max_endorsement_day integer;
  v_target_date date;
  v_current_day integer;

  v_missing_previous_days integer;
  v_existing_count integer;

  v_audit_action text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select
    u.role,
    u.active,
    u.qualified_for
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

  -- Only SRM / Admin / qualified hot_work_srm can endorse Day 2-14.
  if not (
    v_user_role in ('srm', 'admin')
    or 'hot_work_srm' = any(coalesce(v_user_qualified_for, array[]::text[]))
  ) then
    raise exception 'Only qualified SRM users can submit daily endorsements';
  end if;

  if p_day < 2 or p_day > 14 then
    raise exception 'Daily endorsement day must be between Day 2 and Day 14';
  end if;

  if p_action in ('reject', 'revoke') and length(trim(coalesce(p_remarks, ''))) = 0 then
    raise exception 'Remarks are required for reject/revoke endorsement';
  end if;

  select
    p.state,
    p.date_commencement::date,
    p.date_completion::date
  into
    v_from_state,
    v_commencement,
    v_completion
  from public.permits p
  where p.id = p_permit_id
  for update;

  if v_from_state is null then
    raise exception 'Permit not found';
  end if;

  if v_from_state not in ('approved_active', 'pending_daily_endorsement') then
    raise exception 'Permit is not active for daily endorsement. Current state: %', v_from_state;
  end if;

  if v_commencement is null or v_completion is null then
    raise exception 'Permit commencement and completion dates are required';
  end if;

  if v_completion < v_commencement then
    raise exception 'Permit completion date cannot be earlier than commencement date';
  end if;

  v_total_days := (v_completion - v_commencement) + 1;

  if v_total_days <= 1 then
    raise exception 'Single-day permits do not require Day 2-14 endorsement';
  end if;

  v_max_endorsement_day := least(v_total_days, 14);

  if p_day > v_max_endorsement_day then
    raise exception
      'Invalid endorsement day. Permit only requires Day 2 to Day % endorsements',
      v_max_endorsement_day;
  end if;

  v_target_date := v_commencement + (p_day - 1);

  v_current_day := (current_date - v_commencement) + 1;

  -- Prevent future endorsement.
  if current_date < v_target_date then
    raise exception
      'Future endorsement is not allowed. Day % can only be endorsed on %',
      p_day,
      v_target_date;
  end if;

  -- Prevent backdated endorsement.
  if current_date > v_target_date then
    raise exception
      'Backdated endorsement is not allowed. Day % endorsement date was %',
      p_day,
      v_target_date;
  end if;

  -- The submitted day must match today's actual permit day.
  if p_day <> v_current_day then
    raise exception
      'Invalid endorsement day. Today is Day %, but submitted Day %',
      v_current_day,
      p_day;
  end if;

  -- Prevent duplicate endorsement for the same day.
  select count(*)
  into v_existing_count
  from public.permit_endorsements pe
  where pe.permit_id = p_permit_id
    and pe.day_number = p_day;

  if v_existing_count > 0 then
    raise exception 'Day % has already been endorsed', p_day;
  end if;

  -- Enforce sequential endorsements.
  -- Example: Day 4 cannot be endorsed if Day 2 or Day 3 is missing.
  if p_day > 2 then
    select count(*)
    into v_missing_previous_days
    from generate_series(2, p_day - 1) as d(day_number)
    where not exists (
      select 1
      from public.permit_endorsements pe
      where pe.permit_id = p_permit_id
        and pe.day_number = d.day_number
        and pe.action = 'continue'
    );

    if v_missing_previous_days > 0 then
      raise exception
        'Previous daily endorsements must be completed before Day %',
        p_day;
    end if;
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
    nullif(trim(coalesce(p_remarks, '')), ''),
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
  set
    state = v_to_state,
    updated_at = now()
  where id = p_permit_id;

  perform public.write_audit(
    p_permit_id,
    v_audit_action,
    v_from_state,
    v_to_state,
    p_remarks,
    jsonb_build_object(
      'day_number', p_day,
      'action', p_action,
      'remarks', p_remarks,
      'target_date', v_target_date,
      'current_day', v_current_day,
      'total_days', v_total_days,
      'max_endorsement_day', v_max_endorsement_day
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day_number', p_day,
    'action', p_action,
    'from_state', v_from_state,
    'to_state', v_to_state,
    'target_date', v_target_date,
    'current_day', v_current_day,
    'total_days', v_total_days,
    'max_endorsement_day', v_max_endorsement_day
  );
end;
$$;