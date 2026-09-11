-- =========================================================
-- 0009 FINAL — SAFE CLOSE OUT
-- =========================================================

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
  v_user public.users;
  v_from_state public.permit_state;
  v_to_state public.permit_state := 'closed_completed';

  v_applicant_id uuid;
  v_company_id uuid;
  v_site_id uuid;

  v_commencement date;
  v_completion date;
  v_total_days integer;
  v_required_endorsement_days integer;
  v_completed_endorsements integer;
  v_bad_endorsements integer;

  v_stage_data jsonb;
  v_acting_as text;
begin
  -- =========================
  -- USER CHECK
  -- =========================
  select * into v_user
  from public.users
  where id = auth.uid();

  if v_user is null or v_user.active is not true then
    raise exception 'Unauthorized';
  end if;

  -- =========================
  -- LOAD PERMIT
  -- =========================
  select
    p.state,
    p.applicant_id,
    p.company_id,
    p.site_id,
    p.date_commencement,
    p.date_completion
  into
    v_from_state,
    v_applicant_id,
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

  -- ❌ prevent invalid states
  if v_from_state in ('rejected','revoked','expired') then
    raise exception 'Permit cannot be closed from state: %', v_from_state;
  end if;

  -- =========================
  -- AUTHORIZATION
  -- =========================
  if not (
    public.is_admin()
    or v_applicant_id = v_user.id
    or (
      v_company_id is not null
      and v_site_id is not null
      and public.has_site_role(v_company_id, v_site_id, 'srm')
    )
  ) then
    raise exception 'Not allowed to close permit';
  end if;

  if v_from_state not in (
    'approved_active',
    'pending_daily_endorsement',
    'pending_closure'
  ) then
    raise exception 'Permit not ready for close-out. Current: %', v_from_state;
  end if;

  -- =========================
  -- DATE VALIDATION
  -- =========================
  if v_commencement is null or v_completion is null then
    raise exception 'Dates required before close-out';
  end if;

  if v_completion < v_commencement then
    raise exception 'Invalid completion date';
  end if;

  v_total_days := (v_completion - v_commencement) + 1;

  if v_total_days > 1 and current_date < v_completion then
    raise exception 'Cannot close before completion date (%).', v_completion;
  end if;

  -- =========================
  -- ENDORSEMENT CHECK
  -- =========================
  v_required_endorsement_days := greatest(least(v_total_days, 14) - 1, 0);

  if v_required_endorsement_days > 0 then

    select count(*)
    into v_completed_endorsements
    from public.permit_endorsements
    where permit_id = p_permit_id
      and day_number between 2 and least(v_total_days,14)
      and action = 'continue';

    select count(*)
    into v_bad_endorsements
    from public.permit_endorsements
    where permit_id = p_permit_id
      and action in ('reject','revoke');

    if v_bad_endorsements > 0 then
      raise exception 'Rejected/revoked endorsement exists';
    end if;

    if v_completed_endorsements < v_required_endorsement_days then
      raise exception 'Missing endorsements (%/%)',
        v_completed_endorsements,
        v_required_endorsement_days;
    end if;
  end if;

  -- =========================
  -- ACTING AS
  -- =========================
  v_acting_as := case
    when v_applicant_id = v_user.id then 'self'
    when public.is_admin() then 'admin_override'
    else 'srm_override'
  end;

  -- =========================
  -- STAGE SAVE
  -- =========================
  v_stage_data := jsonb_build_object(
    'closed_out', true,
    'closed_by', v_user.id,
    'closed_at', now(),
    'acting_as', v_acting_as,
    'total_days', v_total_days,
    'required_endorsements', v_required_endorsement_days,
    'completed_endorsements', coalesce(v_completed_endorsements,0)
  );

  insert into public.permit_stages (
    permit_id, stage, user_id, data
  )
  values (
    p_permit_id, 'IV', v_user.id, v_stage_data
  )
  on conflict (permit_id, stage)
  do update set
    user_id = excluded.user_id,
    data = excluded.data,
    submitted_at = now();

  -- =========================
  -- UPDATE PERMIT
  -- =========================
  update public.permits
  set
    state = v_to_state,
    closer_id = v_user.id,
    updated_at = now()
  where id = p_permit_id;

  -- =========================
  -- AUDIT (FIXED)
  -- =========================
  perform public.write_audit(
    p_permit_id,
    'closed',
    auth.uid(),
    v_stage_data
  );

  -- =========================
  -- EMAIL (🔥 IMPORTANT)
  -- =========================
  perform public.send_email_event('closed', p_permit_id);

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'status', 'closed',
    'acting_as', v_acting_as
  );
end;
$$;