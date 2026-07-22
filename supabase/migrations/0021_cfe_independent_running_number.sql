-- CFE gets an independent permit running-number sequence.
-- Existing FOI numbering remains unchanged.
-- CFE numbers use CFE-HWP-YYYY-NNN and are counted independently.

create or replace function public.next_permit_serial(p_permit_type text default 'hot_work_onshore')
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now() at time zone 'Asia/Singapore')::int;
  v_next int;
  v_prefix text;
begin
  insert into public.permit_counters (permit_type, year, current_value)
    values (p_permit_type, v_year, 1)
    on conflict (permit_type, year)
    do update set current_value = public.permit_counters.current_value + 1
    returning current_value into v_next;

  v_prefix := case p_permit_type
                when 'hot_work_onshore' then 'FOI-HWP'
                when 'hot_work_onshore_cfe' then 'CFE-HWP'
                else 'FOI-PMT'
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 3, '0'));
end $$;
