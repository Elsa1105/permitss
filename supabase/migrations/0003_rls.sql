-- Migration 0003: Row Level Security policies
-- Server enforces all role-based actions through these policies and the
-- transition functions in 0002. Direct UPDATEs to permits.state are denied.

alter table public.users               enable row level security;
alter table public.permits             enable row level security;
alter table public.permit_stages       enable row level security;
alter table public.permit_endorsements enable row level security;
alter table public.permit_photos       enable row level security;
alter table public.audit_log           enable row level security;
alter table public.permit_counters     enable row level security;

-- =========================================================
-- USERS table
-- =========================================================
-- Anyone authenticated can read user directory (needed for filling
-- assessor/srm dropdowns and showing names alongside permits).
create policy users_select_all
  on public.users for select
  to authenticated
  using (true);

-- Self can update only display fields (not role/qualified_for/active).
create policy users_self_update
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.users where id = auth.uid())
    and qualified_for = (select qualified_for from public.users where id = auth.uid())
    and active = (select active from public.users where id = auth.uid())
  );

-- Admin: full management
create policy users_admin_all
  on public.users for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- PERMITS table
-- =========================================================
-- Read access:
--   * Admin sees all
--   * Applicant sees own permits
--   * Assessors/SRMs see permits relevant to them (queue + acted)
create policy permits_read
  on public.permits for select
  to authenticated
  using (
    public.is_admin()
    or applicant_id = auth.uid()
    or assessor_id  = auth.uid()
    or srm_id       = auth.uid()
    or closer_id    = auth.uid()
    or (public.has_role('assessor') and state = 'pending_safety_assessment')
    or (public.has_role('srm') and state in
         ('pending_srm_approval','approved_active','pending_daily_endorsement','pending_closure'))
  );

-- Insert: any authenticated user with role applicant/admin can create a draft.
-- The serial number is filled by next_permit_serial() (called from API).
create policy permits_insert_draft
  on public.permits for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and state = 'draft'
    and (public.has_role('applicant') or public.is_admin())
  );

-- Update: only allow editing draft permits (header fields). All other state
-- transitions go through the SECURITY DEFINER functions in 0002.
create policy permits_update_draft
  on public.permits for update
  to authenticated
  using (state = 'draft' and (applicant_id = auth.uid() or public.is_admin()))
  with check (state = 'draft' and (applicant_id = auth.uid() or public.is_admin()));

-- Delete: only the applicant can delete a draft (no other state)
create policy permits_delete_draft
  on public.permits for delete
  to authenticated
  using (state = 'draft' and applicant_id = auth.uid());

-- =========================================================
-- PERMIT STAGES
-- =========================================================
-- Read alongside the parent permit
create policy permit_stages_read
  on public.permit_stages for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (p.applicant_id = auth.uid() or p.assessor_id = auth.uid()
              or p.srm_id = auth.uid() or p.closer_id = auth.uid())
    )
    or (public.has_role('assessor'))
    or (public.has_role('srm'))
  );

-- Inserts/updates only via the transition functions
create policy permit_stages_no_direct_write
  on public.permit_stages for all
  to authenticated
  using (false)
  with check (false);

-- =========================================================
-- ENDORSEMENTS
-- =========================================================
create policy permit_endorsements_read
  on public.permit_endorsements for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (p.applicant_id = auth.uid() or p.assessor_id = auth.uid()
              or p.srm_id = auth.uid() or p.closer_id = auth.uid())
    )
    or public.has_role('srm')
  );

create policy permit_endorsements_no_direct_write
  on public.permit_endorsements for all
  to authenticated
  using (false)
  with check (false);

-- =========================================================
-- PHOTOS
-- =========================================================
create policy permit_photos_read
  on public.permit_photos for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (p.applicant_id = auth.uid() or p.assessor_id = auth.uid()
              or p.srm_id = auth.uid() or p.closer_id = auth.uid())
    )
    or (public.has_role('assessor'))
    or (public.has_role('srm'))
  );

-- Applicant can attach photos to a permit they own while in draft or
-- pending_safety_assessment (assessor inspection sometimes adds further photos).
create policy permit_photos_insert
  on public.permit_photos for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (
           (p.applicant_id = auth.uid() and p.state in ('draft','pending_safety_assessment'))
           or public.is_admin()
         )
    )
  );

create policy permit_photos_delete_own
  on public.permit_photos for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.permits p
       where p.id = permit_id and p.state = 'draft'
    )
  );

-- =========================================================
-- AUDIT LOG --- append-only, readable by admin & involved parties
-- =========================================================
create policy audit_log_read
  on public.audit_log for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (p.applicant_id = auth.uid() or p.assessor_id = auth.uid()
              or p.srm_id = auth.uid() or p.closer_id = auth.uid())
    )
  );

-- Direct writes denied --- audit is written by SECURITY DEFINER write_audit().
create policy audit_log_no_direct_write
  on public.audit_log for insert
  to authenticated
  with check (false);

create policy audit_log_no_update
  on public.audit_log for update
  to authenticated
  using (false)
  with check (false);

create policy audit_log_no_delete
  on public.audit_log for delete
  to authenticated
  using (false);

-- =========================================================
-- COUNTERS --- only via next_permit_serial() (security definer)
-- =========================================================
create policy permit_counters_no_direct
  on public.permit_counters for all
  to authenticated
  using (false)
  with check (false);

-- =========================================================
-- SIGNUP TRIGGER --- mirror auth.users into public.users
-- =========================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role, qualified_for)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'applicant'),
    coalesce(string_to_array(new.raw_user_meta_data->>'qualified_for', ','), '{}')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
