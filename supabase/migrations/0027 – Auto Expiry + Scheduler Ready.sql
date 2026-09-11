-- Migration 0027: Auto expire permits

create or replace function public.expire_permits()
returns void
language plpgsql
as $$
begin
  update public.permits
  set state = 'expired',
      updated_at = now()
  where state in ('approved_active', 'pending_daily_endorsement', 'pending_closure')
    and date_completion < current_date;
end;
$$;