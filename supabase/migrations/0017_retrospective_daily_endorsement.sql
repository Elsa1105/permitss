-- Migration 0017: Allow retrospective daily endorsement

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
  v_max_endorsement_day integer;
  v_target_date date;
  v_current_day integer;
  v_is_retrospective boolean;

  v_existing_count integer;

  v_audit_action public.audit_action;
  v_clean_remarks text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

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

  if not (
    public.is_admin()
    or public.has_site_role(v_company_id, v_site_id, 'srm')
    or (
      (v_company_id is null or v_site_id is null)
      and v_user_role = 'srm'
      and 'hot_work_srm' = any(v_user_qualified_for)
    )
  ) then
    raise exception 'Only site-scoped SRM users can submit daily endorsements';
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

  -- Block future only
  if current_date < v_target_date then
    raise exception
      'Future endorsement is not allowed. Day % can only be endorsed on or after %',
      p_day,
      v_target_date;
  end if;

  -- Retrospective allowed
  v_is_retrospective := current_date > v_target_date;

  select count(*)
  into v_existing_count
  from public.permit_endorsements pe
  where pe.permit_id = p_permit_id
    and pe.day_number = p_day;

  if v_existing_count > 0 then
    raise exception 'Day % has already been endorsed', p_day;
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
    case
      when v_is_retrospective then
        trim(
          coalesce(v_clean_remarks || E'\n\n', '')
          || format(
            '[Retrospective endorsement submitted on %s for Day %s, originally due %s]',
            current_date,
            p_day,
            v_target_date
          )
        )
      else
        v_clean_remarks
    end,
    now()
  );

  if p_action = 'continue' then
    if p_day >= v_max_endorsement_day then
      v_to_state := 'pending_closure'::public.permit_state;
    else
      v_to_state := 'pending_daily_endorsement'::public.permit_state;
    end if;

    v_audit_action := 'endorsed_continue'::public.audit_action;

  elsif p_action = 'reject' then
    v_to_state := 'revoked'::public.permit_state;
    v_audit_action := 'endorsed_reject'::public.audit_action;

  else
    v_to_state := 'revoked'::public.permit_state;
    v_audit_action := 'endorsed_revoke'::public.audit_action;
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
    v_clean_remarks,
    jsonb_build_object(
      'day_number', p_day,
      'action', p_action::text,
      'remarks', v_clean_remarks,
      'target_date', v_target_date,
      'current_day', v_current_day,
      'total_days', v_total_days,
      'max_endorsement_day', v_max_endorsement_day,
      'retrospective', v_is_retrospective
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day_number', p_day,
    'action', p_action::text,
    'from_state', v_from_state::text,
    'to_state', v_to_state::text,
    'target_date', v_target_date,
    'current_day', v_current_day,
    'total_days', v_total_days,
    'max_endorsement_day', v_max_endorsement_day,
    'retrospective', v_is_retrospective
  );
end;
$$;