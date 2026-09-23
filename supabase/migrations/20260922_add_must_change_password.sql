-- Restores a real "force change on next login" mechanism, to go with
-- self-service password changes (app/(app)/settings/change-password).
--
-- UAT feedback: "Password change option not available, all password same."
-- Root cause: (1) the self-service change-password page had been removed
-- in favor of admin-only reset, and (2) every CSV bulk-imported user was
-- given the SAME hardcoded default password. This column lets the app
-- force anyone on an admin-set password to choose their own before they
-- can use the rest of the app.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

-- No new RLS policy needed: clearing this flag is done server-side via
-- /api/account/change-password using the service-role client (same
-- pattern as the existing admin reset-password route), specifically to
-- avoid adding a broad "users can update their own row" policy that would
-- also let someone self-update role/active/qualified_for.
