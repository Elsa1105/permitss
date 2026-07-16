-- Migration 0017: ePermit enhancement requests (email dated 14 Jul 2026, Hi Elsa)
--
-- 1. Photo Comment for the Assessor when an employee/location is marked
--    Not Fit for Work — adds a caption to permit_photos so Stage II
--    evidence photos can carry a written comment.
-- 2. Approval date for each day of endorsement — permit_endorsements now
--    stores the scheduled target_date alongside the actual approval
--    timestamp (ts), plus an explicit retrospective flag, for a clear
--    audit trail.
-- 3. Retrospective endorsement — permit_endorse_day() no longer rejects
--    endorsements submitted after the target day (public holiday, leave,
--    oversight). Future-dated endorsements are still blocked. Days must
--    still be endorsed in order (2, 3, 4, ...), so a missed day is caught
--    up before later days can be submitted.
-- 4. Public QR record without login — see app/public/permits/[id]/page.tsx
--    and the new app/public/permits/[id]/pdf/route.ts (service-role,
--    unauthenticated) shipped alongside this migration. This migration
--    exposes the endorser's name for that read-only view.

-- =====================================================
-- 1. Photo Comment
-- =====================================================

alter table public.permit_photos
add column if not exists caption text;

comment on column public.permit_photos.caption is
'Optional written comment from the uploader (e.g. the Safety Assessor explaining a Not Fit photo).';

-- =====================================================
-- 2. Approval date / audit trail columns
-- =====================================================

alter table public.permit_endorsements
add column if not exists target_date date;

alter table public.permit_endorsements
add column if not exists retrospective boolean not null default false;

-- Backfill target_date for any pre-existing rows so historical records also
-- show a due date next to the actual approval date.
update public.permit_endorsements pe
set target_date = p.date_commencement::date + (pe.day_number - 1)
from public.permits p
where p.id = pe.permit_id
  and pe.target_date is null;

update public.permit_endorsements
set retrospective = (target_date is not null and target_date <> ts::date)
where target_date is not null;

comment on column public.permit_endorsements.target_date is
'The permit day this endorsement was due (date_commencement + day_number - 1).';

comment on column public.permit_endorsements.retrospective is
'True when the endorsement (ts) was submitted after its target_date — a missed day caught up late.';

-- =====================================================
-- 3. Retrospective endorsement support
-- =====================================================

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
  v_retrospective boolean;

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
    raise exception 'Only an authorised SRM / Project Manager for this permit site can submit daily endorsements';
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
  v_current_day := (v_today - v_commencement) + 1;

  -- Future endorsement remains blocked: you cannot endorse a day that
  -- hasn't happened yet.
  if v_today < v_target_date then
    raise exception
      'Future endorsement is not allowed. Day % can only be endorsed on or after %',
      p_day,
      v_target_date;
  end if;

  -- Retrospective (backdated) endorsement is now allowed: a day missed due
  -- to a public holiday, leave, or oversight can be endorsed late. Days
  -- must still be completed in order, enforced below, so catching up
  -- requires endorsing the earliest missing day first.
  v_retrospective := v_today > v_target_date;

  select count(*)
  into v_existing_count
  from public.permit_endorsements pe
  where pe.permit_id = p_permit_id
    and pe.day_number = p_day;

  if v_existing_count > 0 then
    raise exception 'Day % has already been endorsed', p_day;
  end if;

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
        'Previous daily endorsements must be completed before Day %. Endorse the earliest missing day first (retrospective endorsement is allowed).',
        p_day;
    end if;
  end if;

  insert into public.permit_endorsements (
    permit_id,
    day_number,
    endorser_id,
    action,
    remarks,
    ts,
    target_date,
    retrospective
  )
  values (
    p_permit_id,
    p_day,
    v_user_id,
    p_action,
    v_clean_remarks,
    now(),
    v_target_date,
    v_retrospective
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
      'today_singapore', v_today,
      'current_day', v_current_day,
      'total_days', v_total_days,
      'max_endorsement_day', v_max_endorsement_day,
      'retrospective', v_retrospective,
      'leave_coverage_enabled', true,
      'endorser_id', v_user_id,
      'permit_stage3_srm_id', (
        select p.srm_id from public.permits p where p.id = p_permit_id
      )
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'day_number', p_day,
    'action', p_action::text,
    'from_state', v_from_state::text,
    'to_state', v_to_state::text,
    'target_date', v_target_date,
    'today_singapore', v_today,
    'current_day', v_current_day,
    'total_days', v_total_days,
    'max_endorsement_day', v_max_endorsement_day,
    'retrospective', v_retrospective,
    'endorser_id', v_user_id
  );
end;
$$;
