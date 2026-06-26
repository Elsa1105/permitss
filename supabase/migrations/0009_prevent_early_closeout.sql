-- Migration 0009: Prevent multi-day permit close-out before required Day 2-14 endorsements
drop function if exists public.permit_submit_stage4(uuid);
create or replace function public.permit_submit_stage4(
  p_permit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_from_state text;
  v_to_state text := 'closed_completed';

  v_commencement date;
  v_completion date;
  v_total_days integer;
  v_required_endorsement_days integer;
  v_completed_endorsements integer;
  v_bad_endorsements integer;

  v_stage_data jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
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

  -- Only active / closure-ready permits can be closed.
  if v_from_state not in (
    'approved_active',
    'pending_daily_endorsement',
    'pending_closure'
  ) then
    raise exception 'Permit is not ready for close-out. Current state: %', v_from_state;
  end if;

  if v_commencement is null or v_completion is null then
    raise exception 'Permit commencement and completion dates are required before close-out';
  end if;

  if v_completion < v_commencement then
    raise exception 'Permit completion date cannot be earlier than commencement date';
  end if;

  v_total_days := (v_completion - v_commencement) + 1;

  -- BUG-04 fix:
  -- Multi-day permit cannot be closed before planned completion date.
  if v_total_days > 1 and current_date < v_completion then
    raise exception
      'Multi-day permit cannot be closed before the planned completion date. Completion date: %',
      v_completion;
  end if;

  -- Day 2-14 endorsement is required for multi-day permits.
  -- Example:
  -- 1 day  = 0 endorsement required
  -- 2 days = Day 2 required
  -- 3 days = Day 2 and Day 3 required
  -- 14+ days = Day 2 through Day 14 required
  v_required_endorsement_days := greatest(least(v_total_days, 14) - 1, 0);

  if v_required_endorsement_days > 0 then
    select count(*)
    into v_completed_endorsements
    from public.permit_endorsements pe
    where pe.permit_id = p_permit_id
      and pe.day_number between 2 and least(v_total_days, 14)
      and pe.action = 'continue';

    select count(*)
    into v_bad_endorsements
    from public.permit_endorsements pe
    where pe.permit_id = p_permit_id
      and pe.day_number between 2 and least(v_total_days, 14)
      and pe.action in ('reject', 'revoke');

    if v_bad_endorsements > 0 then
      raise exception
        'Permit cannot be closed because one or more daily endorsements were rejected or revoked';
    end if;

    if v_completed_endorsements < v_required_endorsement_days then
      raise exception
        'Multi-day permit cannot be closed. Required Day 2-14 endorsements: %, completed: %',
        v_required_endorsement_days,
        v_completed_endorsements;
    end if;
  end if;

  v_stage_data := jsonb_build_object(
    'closed_out', true,
    'closed_by', v_user_id,
    'closed_at', now(),
    'total_days', v_total_days,
    'required_endorsement_days', v_required_endorsement_days,
    'completed_endorsements', v_completed_endorsements
  );

  insert into public.permit_stages (
    permit_id,
    stage,
    data,
    submitted_by,
    submitted_at
  )
  values (
    p_permit_id,
    'IV',
    v_stage_data,
    v_user_id,
    now()
  )
  on conflict (permit_id, stage)
  do update set
    data = excluded.data,
    submitted_by = excluded.submitted_by,
    submitted_at = excluded.submitted_at;

  update public.permits
  set
    state = v_to_state,
    closer_id = v_user_id,
    updated_at = now()
  where id = p_permit_id;

  perform public.write_audit(
    p_permit_id,
    'closed',
    v_from_state,
    v_to_state,
    null,
    v_stage_data
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'from_state', v_from_state,
    'to_state', v_to_state,
    'total_days', v_total_days,
    'required_endorsement_days', v_required_endorsement_days,
    'completed_endorsements', v_completed_endorsements
  );
end;
$$;