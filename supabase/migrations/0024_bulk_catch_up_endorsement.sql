-- Migration 0024: Bulk catch-up daily endorsement (CLEANED)

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
  v_fill_day integer;
  v_filled_days integer[] := array[]::integer[];

  v_audit_action public.audit_action;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

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

  if p_action in ('reject', 'revoke') and length(trim(coalesce(p_remarks, ''))) = 0 then
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

  if current_date < v_target_date then
    raise exception
      'Future endorsement is not allowed. Day % can only be endorsed on or after %',
      p_day,
      v_target_date;
  end if;

  v_is_retrospective := current_date > v_target_date;

  select count(*)
  into v_existing_count
  from public.permit_endorsements pe
  where pe.permit_id = p_permit_id
    and pe.day_number = p_day;

  if v_existing_count > 0 then
    raise exception 'Day % has already been endorsed', p_day;
  end if;

  -- ✅ FIX: guard loop
  if p_day > 2 then
    for v_fill_day in 2 .. (p_day - 1) loop
      select count(*)
      into v_existing_count
      from public.permit_endorsements pe
      where pe.permit_id = p_permit_id
        and pe.day_number = v_fill_day;

      if v_existing_count = 0 then
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
          v_fill_day,
          v_user_id,
          'continue',
          format(
            '[Auto-filled on %s together with Day %s. Originally due %s.]',
            current_date,
            p_day,
            v_commencement + (v_fill_day - 1)
          ),
          now()
        );

        perform public.write_audit(
          p_permit_id,
          'endorsed_continue'::public.audit_action,
          v_from_state,
          v_from_state,
          'Auto-filled bulk catch-up',
          jsonb_build_object(
            'day_number', v_fill_day,
            'bulk_fill', true,
            'filled_with_day', p_day
          )
        );

        v_filled_days := array_append(v_filled_days, v_fill_day);
      end if;
    end loop;
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
          coalesce(nullif(trim(coalesce(p_remarks, '')), '') || E'\n\n', '')
          || format(
            '[Retrospective submitted on %s for Day %s (due %s)]',
            current_date,
            p_day,
            v_target_date
          )
        )
      else
        nullif(trim(coalesce(p_remarks, '')), '')
    end,
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
      'bulk_filled_days', v_filled_days,
      'retrospective', v_is_retrospective
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day_number', p_day,
    'action', p_action,
    'filled_days', v_filled_days,
    'retrospective', v_is_retrospective
  );
end;
$$;