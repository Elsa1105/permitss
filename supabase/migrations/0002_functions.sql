-- =========================================================
-- 0002_functions.sql
-- =========================================================

create extension if not exists pg_net;

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;

create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = p_role::user_role
      and active = true
  );
$$;

-- =========================================================
-- CHECK SAME COMPANY (🔥 IMPORTANT)
-- =========================================================
create or replace function public.same_company(p_permit_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.permits p
    join public.users u on u.id = auth.uid()
    where p.id = p_permit_id
      and p.company_id = u.company_id
  );
$$;

-- =========================================================
-- AUDIT LOG
-- =========================================================

create or replace function public.write_audit(
  p_permit_id uuid,
  p_action audit_action,
  p_actor uuid,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (
    permit_id,
    action,
    actor_id,
    metadata
  )
  values (
    p_permit_id,
    p_action,
    p_actor,
    p_meta
  );
end;
$$;

-- =========================================================
-- EMAIL EVENT (NO HARDCODE DOMAIN)
-- =========================================================

create or replace function public.send_email_event(
  p_event text,
  p_permit_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_url text := current_setting('app.settings.email_url', true);
begin
  if v_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'event', p_event,
      'permit_id', p_permit_id
    )
  );
end;
$$;

-- =========================================================
-- SERIAL
-- =========================================================

create or replace function public.next_permit_serial(
  p_type text default 'hot_work_onshore'
)
returns text
language plpgsql
security definer
as $$
declare
  v_year int := extract(year from now());
  v_counter int;
begin
  update public.permit_counters
  set current_value = current_value + 1
  where permit_type = p_type and year = v_year
  returning current_value into v_counter;

  if not found then
    insert into public.permit_counters (permit_type, year, current_value)
    values (p_type, v_year, 1)
    returning current_value into v_counter;
  end if;

  return 'PTW-' || v_year || '-' || lpad(v_counter::text, 5, '0');
end;
$$;

-- =========================================================
-- SUBMIT
-- =========================================================

create or replace function public.submit_permit(p_permit_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not public.same_company(p_permit_id) then
    raise exception 'Different company';
  end if;

  update public.permits
  set state = 'pending_safety_assessment'
  where id = p_permit_id
    and applicant_id = auth.uid()
    and state = 'draft';

  if not found then
    raise exception 'Invalid state transition';
  end if;

  perform public.write_audit(p_permit_id, 'submitted', auth.uid());
  perform public.send_email_event('submitted', p_permit_id);
end;
$$;

-- =========================================================
-- ASSESS
-- =========================================================

create or replace function public.assess_permit(
  p_permit_id uuid,
  p_fit boolean,
  p_notes text
)
returns void
language plpgsql
security definer
as $$
begin
  if not public.has_role('assessor') then
    raise exception 'Not assessor';
  end if;

  if not public.same_company(p_permit_id) then
    raise exception 'Different company';
  end if;

  update public.permits
  set state = case
      when p_fit then 'pending_srm_approval'
      else 'not_fit'
    end,
    assessor_id = auth.uid()
  where id = p_permit_id
    and state = 'pending_safety_assessment';

  if not found then
    raise exception 'Invalid state transition';
  end if;

  perform public.write_audit(
    p_permit_id,
    case when p_fit then 'fit' else 'not_fit' end,
    auth.uid(),
    jsonb_build_object('notes', p_notes)
  );

  perform public.send_email_event(
    case when p_fit then 'fit' else 'not_fit' end,
    p_permit_id
  );
end;
$$;

-- =========================================================
-- SRM APPROVAL
-- =========================================================

create or replace function public.srm_approve_permit(
  p_permit_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
as $$
begin
  if not public.has_role('srm') then
    raise exception 'Not SRM';
  end if;

  if not public.same_company(p_permit_id) then
    raise exception 'Different company';
  end if;

  update public.permits
  set state = case
      when p_decision = 'approve' then 'approved_active'
      else 'rejected'
    end,
    srm_id = auth.uid()
  where id = p_permit_id
    and state = 'pending_srm_approval';

  if not found then
    raise exception 'Invalid state transition';
  end if;

  perform public.write_audit(
    p_permit_id,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    auth.uid()
  );

  perform public.send_email_event(
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    p_permit_id
  );
end;
$$;

-- =========================================================
-- ENDORSEMENT
-- =========================================================

create or replace function public.endorse_permit(
  p_permit_id uuid,
  p_day int,
  p_action endorsement_action,
  p_remarks text
)
returns void
language plpgsql
security definer
as $$
begin
  if not public.has_role('srm') then
    raise exception 'Not SRM';
  end if;

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
    auth.uid(),
    p_action,
    p_remarks
  );

  update public.permits
  set state = 'pending_daily_endorsement'
  where id = p_permit_id;

  perform public.write_audit(
    p_permit_id,
    case
      when p_action = 'continue' then 'endorsed_continue'
      when p_action = 'reject' then 'endorsed_reject'
      else 'endorsed_revoke'
    end,
    auth.uid()
  );

  perform public.send_email_event('endorsement', p_permit_id);
end;
$$;

-- =========================================================
-- CLOSE
-- =========================================================

create or replace function public.close_permit(p_permit_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.permits
  set state = 'closed_completed',
      closer_id = auth.uid()
  where id = p_permit_id
    and state = 'pending_closure';

  if not found then
    raise exception 'Invalid close state';
  end if;

  perform public.write_audit(p_permit_id, 'closed', auth.uid());
  perform public.send_email_event('closed', p_permit_id);
end;
$$;

-- =========================================================
-- DAILY REMINDER
-- =========================================================

create or replace function public.send_daily_reminder()
returns void
language plpgsql
security definer
as $$
declare r record;
begin
  for r in
    select id
    from public.permits
    where state in ('approved_active','pending_daily_endorsement')
  loop
    perform public.send_email_event('daily_reminder', r.id);
  end loop;
end;
$$;

-- =========================================================
-- CLOSURE REMINDER
-- =========================================================

create or replace function public.send_closure_reminder()
returns void
language plpgsql
security definer
as $$
declare r record;
begin
  for r in
    select id
    from public.permits
    where state = 'pending_closure'
  loop
    perform public.send_email_event('closure_reminder', r.id);
  end loop;
end;
$$;

