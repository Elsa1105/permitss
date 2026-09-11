-- Migration 0028: Audit log foundation

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid,
  action public.audit_action,
  from_state public.permit_state,
  to_state public.permit_state,
  remarks text,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_permit
on public.audit_logs(permit_id);

create index if not exists idx_audit_created
on public.audit_logs(created_at desc);