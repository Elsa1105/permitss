-- =========================================================
-- 0005 FINAL (SRM OVERRIDE + SAFE + EMAIL CONNECTED)
-- =========================================================

-- =========================================================
-- STAGE I (APPLICANT / SRM / ADMIN)
-- =========================================================
create or replace function public.permit_submit_stage1(
  p_permit_id uuid,
  p_stage_data jsonb
)
returns public.permits
language plpgsql
security definer
as $$
declare
  v_permit public.permits;
  v_user public.users;
  v_acting_as text;
begin
  select * into v_user from public.users where id = auth.uid();

  if v_user is null or not v_user.active then
    raise exception 'Unauthorized';
  end if;

  select * into v_permit
  from public.permits
  where id = p_permit_id
  for update;

  if v_permit.company_id <> v_user.company_id then
    raise exception 'Different company';
  end if;

  if v_permit.applicant_id <> v_user.id
     and v_user.role not in ('srm','admin') then
    raise exception 'No permission';
  end if;

  if v_permit.state <> 'draft' then
    raise exception 'Invalid state';
  end if;

  v_acting_as :=
    case when v_permit.applicant_id = v_user.id
      then 'self'
      else v_user.role || '_override'
    end;

  insert into public.permit_stages (permit_id, stage, user_id, data)
  values (
    p_permit_id, 'I', v_user.id,
    p_stage_data || jsonb_build_object('acting_as', v_acting_as)
  )
  on conflict (permit_id, stage)
  do update set data = excluded.data, user_id = excluded.user_id;

  update public.permits
  set state = 'pending_safety_assessment'
  where id = p_permit_id
  returning * into v_permit;

  perform public.write_audit(
    p_permit_id,
    'submitted',
    auth.uid(),
    jsonb_build_object('acting_as', v_acting_as)
  );

  perform public.create_notification('submitted', p_permit_id);

  return v_permit;
end;
$$;

-- =========================================================
-- STAGE II (ASSESSOR / SRM / ADMIN)
-- =========================================================
create or replace function public.permit_submit_stage2(
  p_permit_id uuid,
  p_fit boolean,
  p_remarks text
)
returns public.permits
language plpgsql
security definer
as $$
declare
  v_permit public.permits;
  v_user public.users;
  v_acting_as text;
begin
  select * into v_user from public.users where id = auth.uid();

  if v_user.role not in ('assessor','srm','admin') then
    raise exception 'Not allowed';
  end if;

  select * into v_permit
  from public.permits
  where id = p_permit_id
  for update;

  if v_permit.company_id <> v_user.company_id then
    raise exception 'Different company';
  end if;

  if v_permit.state <> 'pending_safety_assessment' then
    raise exception 'Invalid state';
  end if;

  v_acting_as :=
    case when v_user.role = 'assessor'
      then 'self'
      else v_user.role || '_override'
    end;

  update public.permits
  set
    assessor_id = auth.uid(),
    state = case when p_fit then 'pending_srm_approval' else 'not_fit' end
  where id = p_permit_id
  returning * into v_permit;

  perform public.write_audit(
    p_permit_id,
    case when p_fit then 'fit' else 'not_fit' end,
    auth.uid(),
    jsonb_build_object('remarks', p_remarks, 'acting_as', v_acting_as)
  );

  perform public.create_notification(
    case when p_fit then 'fit' else 'not_fit' end,
    p_permit_id
  );

  return v_permit;
end;
$$;

-- =========================================================
-- STAGE IV (CLOSE)
-- =========================================================
create or replace function public.permit_submit_stage4(
  p_permit_id uuid
)
returns public.permits
language plpgsql
security definer
as $$
declare
  v_permit public.permits;
  v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid();

  select * into v_permit
  from public.permits
  where id = p_permit_id
  for update;

  if v_permit.company_id <> v_user.company_id then
    raise exception 'Different company';
  end if;

  if v_user.role not in ('applicant','srm','admin') then
    raise exception 'Not allowed';
  end if;

  update public.permits
  set state = 'closed_completed',
      closer_id = auth.uid()
  where id = p_permit_id
  returning * into v_permit;

  perform public.write_audit(
    p_permit_id,
    'closed',
    auth.uid(),
    '{}'::jsonb
  );

  perform public.create_notification('closed', p_permit_id);

  return v_permit;
end;
$$;

-- =========================================================
-- 🔥 FIX RLS (JANGAN BUKA SEMUA KE SRM)
-- =========================================================

drop policy if exists permits_read on public.permits;

create policy permits_read
on public.permits for select
to authenticated
using (
  company_id = public.get_user_company()
  and (
    public.is_admin()
    or applicant_id = auth.uid()
    or assessor_id = auth.uid()
    or srm_id = auth.uid()
    or closer_id = auth.uid()

    or (public.has_role('assessor') and state = 'pending_safety_assessment')

    or (
      public.has_role('srm')
      and state in (
        'draft',
        'pending_safety_assessment',
        'pending_srm_approval',
        'approved_active',
        'pending_daily_endorsement',
        'pending_closure'
      )
    )
  )
);