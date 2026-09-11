-- Migration 0023: Extend permit serial number to six digits (FIXED + SAFE)

create or replace function public.next_permit_serial(
  p_permit_type text default 'hot_work_onshore'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now() at time zone 'Asia/Singapore')::int;
  v_next int;
  v_prefix text;
  v_counter_key text;
begin
  -- ✅ pisahkan counter untuk FOI vs CFE
  v_counter_key := p_permit_type;

  insert into public.permit_counters (permit_type, year, current_value)
    values (v_counter_key, v_year, 1)
    on conflict (permit_type, year)
    do update set current_value = public.permit_counters.current_value + 1
    returning current_value into v_next;

  -- ✅ prefix logic tetap sama (tidak diubah besar)
  v_prefix := case p_permit_type
                when 'hot_work_onshore' then 'FOI-HWP'
                when 'hot_work_onshore_cfe' then 'CFE-HWP'
                else 'FOI-PMT'
              end;

  -- ✅ CHANGE ONLY: 3 digit → 6 digit
  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 6, '0'));
end $$;