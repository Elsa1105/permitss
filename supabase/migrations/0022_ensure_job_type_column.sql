create or replace function public.next_permit_serial(
  p_permit_type text default 'hot_work_onshore',
  p_company_code text default 'FOI'  -- ✅ NEW
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
  -- ✅ pisahkan counter berdasarkan company
  v_counter_key := p_permit_type || '_' || p_company_code;

  insert into public.permit_counters (permit_type, year, current_value)
    values (v_counter_key, v_year, 1)
    on conflict (permit_type, year)
    do update set current_value = public.permit_counters.current_value + 1
    returning current_value into v_next;

  -- ✅ prefix tetap clean
  v_prefix := case p_company_code
                when 'CFE' then 'CFE-HWP'
                else 'FOI-HWP'
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 3, '0'));
end;
$$;