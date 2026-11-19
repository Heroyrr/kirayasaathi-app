-- =====================================================================
-- OWNER APP  |  PART 4 of 4: Leads, tenant check by phone, deposit + advance on the first invoice
-- Safe to run again. If you already ran parts 1-3, run only this part.
-- =====================================================================

-- ---------- leads: new columns ----------
alter table public.leads add column if not exists property_id  bigint references public.properties(id) on delete set null;
alter table public.leads add column if not exists last_talk    text;
alter table public.leads add column if not exists last_talk_at timestamptz;
-- next action is a DATE (the day you will act), not a date and time
do $$ begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'next_action_at') <> 'date' then
    alter table public.leads alter column next_action_at type date using (next_action_at at time zone 'Asia/Kolkata')::date;
  end if;
end $$;
create index if not exists leads_status_idx on public.leads(user_id, status);
create index if not exists leads_next_idx   on public.leads(user_id, next_action_at);

create or replace function public._lead_json(lid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'property_id', l.property_id,
    'property', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'name', pr.name) end,
    'note', l.note, 'status', l.status, 'last_talk', l.last_talk, 'last_talk_at', l.last_talk_at,
    'next_action', l.next_action, 'next_action_at', l.next_action_at, 'created_at', l.created_at)
  from leads l left join properties pr on pr.id = l.property_id where l.id = lid
$$;

-- list + counts per status (counts follow the search and the date, so the chips show how many are waiting)
create or replace function public.api_get_leads(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_st text := nullif(p->>'status', ''); v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_d text; v_date date := public._date(p->>'date'); v_counts jsonb; v_list jsonb;
begin
  v_d := regexp_replace(coalesce(v_s, ''), '\D', '', 'g');
  select jsonb_build_object(
      'pending',    count(*) filter (where l.status = 'pending'),
      'processing', count(*) filter (where l.status = 'processing'),
      'done',       count(*) filter (where l.status = 'done'),
      'cancel',     count(*) filter (where l.status = 'cancel'),
      'total',      count(*))
    into v_counts
    from leads l
   where l.user_id = v_uid
     and (v_s is null or l.name ilike '%' || v_s || '%' or (v_d <> '' and l.phone like '%' || v_d || '%'))
     and (v_date is null or l.next_action_at = v_date);
  select coalesce(jsonb_agg(public._lead_json(x.id) order by x.next_action_at nulls last, x.id desc), '[]'::jsonb) into v_list
    from leads x
   where x.user_id = v_uid
     and (v_st is null or x.status = v_st)
     and (v_s is null or x.name ilike '%' || v_s || '%' or (v_d <> '' and x.phone like '%' || v_d || '%'))
     and (v_date is null or x.next_action_at = v_date);
  return jsonb_build_object('counts', v_counts, 'leads', v_list);
end $$;

create or replace function public.api_get_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id');
begin
  if not exists (select 1 from leads where id = v_id and user_id = v_uid) then perform public._nf(); end if;
  return public._lead_json(v_id);
end $$;

create or replace function public.api_add_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_pid bigint := public._bid(p->>'property_id'); v_id bigint;
begin
  perform public._assert_write(v_uid);
  if coalesce(trim(p->>'name'), '') = '' or v_ph is null or v_ph !~ '^[6-9][0-9]{9}$' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  if v_pid is not null then perform public._chk_property(v_pid, v_uid); end if;
  insert into leads(user_id, name, phone, property_id, note, status)
  values (v_uid, trim(p->>'name'), v_ph, v_pid, nullif(trim(coalesce(p->>'note', '')), ''), 'pending') returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_update_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id'); l leads;
  v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_pid bigint := public._bid(p->>'property_id'); v_talk text; v_date date := public._date(p->>'next_action_at');
begin
  perform public._assert_write(v_uid);
  select * into l from leads where id = v_id and user_id = v_uid;
  if not found then perform public._nf(); end if;
  if (p ? 'status' and coalesce(p->>'status', '') not in ('pending','processing','done','cancel'))
     or (p ? 'name' and trim(coalesce(p->>'name', '')) = '')
     or (p ? 'phone' and (v_ph is null or v_ph !~ '^[6-9][0-9]{9}$'))
     or (p ? 'next_action_at' and nullif(p->>'next_action_at', '') is not null and v_date is null) then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  if p ? 'property_id' and v_pid is not null then perform public._chk_property(v_pid, v_uid); end if;
  v_talk := case when p ? 'last_talk' then nullif(trim(coalesce(p->>'last_talk', '')), '') else l.last_talk end;
  update leads set
    name           = case when p ? 'name' then trim(p->>'name') else name end,
    phone          = case when p ? 'phone' then v_ph else phone end,
    property_id    = case when p ? 'property_id' then v_pid else property_id end,
    note           = case when p ? 'note' then nullif(trim(coalesce(p->>'note', '')), '') else note end,
    status         = case when p ? 'status' then p->>'status' else status end,
    last_talk      = v_talk,
    last_talk_at   = case when v_talk is distinct from l.last_talk then now() else last_talk_at end,
    next_action    = case when p ? 'next_action' then nullif(trim(coalesce(p->>'next_action', '')), '') else next_action end,
    next_action_at = case when p ? 'next_action_at' then v_date else next_action_at end
  where id = v_id;
  return public._lead_json(v_id);
end $$;

create or replace function public.api_delete_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  if not exists (select 1 from leads where id = v_id and user_id = v_uid) then perform public._nf(); end if;
  delete from leads where id = v_id;
  return jsonb_build_object('deleted', true);
end $$;

-- ---------- new tenant: same mobile number as a tenant who is still staying = error ----------
create or replace function public.api_add_tenant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint; v_ex tenants;
  v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
begin
  perform public._assert_write(v_uid);
  if coalesce(trim(p->>'name'), '') = '' or (v_ph is not null and v_ph !~ '^[6-9][0-9]{9}$') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  if v_ph is not null then
    select * into v_ex from tenants where user_id = v_uid and phone = v_ph order by id limit 1;
    if found then
      if exists (select 1 from bookings where tenant_id = v_ex.id and status <> 'moved_out') then
        perform public._err('TENANT_LIVE', 'This tenant is already staying. Move them out first.');
      end if;
      -- came back later: same person, a new booking that starts at zero (ID proofs are kept)
      update tenants set name = trim(p->>'name'), photo_key = coalesce(nullif(p->>'photo_key', ''), photo_key) where id = v_ex.id;
      return jsonb_build_object('id', v_ex.id, 'reused', true);
    end if;
  end if;
  insert into tenants(user_id, name, phone, photo_key)
  values (v_uid, trim(p->>'name'), v_ph, nullif(p->>'photo_key', '')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ---------- invoice: can take the advance off the first invoice ----------
create or replace function public.api_add_invoice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id'); b bookings;
  v_ps date := public._date(p->>'period_start'); v_pe date := public._date(p->>'period_end');
  v_rent numeric := public._num(p->>'rent'); v_rate numeric := public._num(p->>'rate');
  v_sr numeric := public._num(p->>'start_reading'); v_er numeric := public._num(p->>'end_reading');
  v_reset boolean := coalesce((p->>'meter_reset')::boolean, false);
  v_extras jsonb := coalesce(p->'extras', '[]'::jsonb); v_ex jsonb; v_esum numeric := 0; v_split int; v_elec numeric; v_iid bigint;
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  select * into b from bookings where id = v_bid;
  if v_ps is null or v_pe is null or v_pe < v_ps or v_rent is null or v_rent < 0 then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  for v_ex in select * from jsonb_array_elements(v_extras) loop
    if coalesce(trim(v_ex->>'name'), '') = '' or public._num(v_ex->>'amount') is null then
      perform public._err('E_VALIDATION', 'Please check the extra charges.');
    end if;
    v_esum := v_esum + public._num(v_ex->>'amount');
  end loop;
  v_split := greatest(1, coalesce(public._num(p->>'split_count'),
              (select count(*) from bookings where room_id = b.room_id and status <> 'moved_out'), 1))::int;

  -- an edited meter reading is saved as a NEW reading in the room's history
  if v_er is not null then
    if v_sr is not null and not exists (select 1 from meter_readings where room_id = b.room_id) then
      perform public._save_reading(v_uid, b.room_id, v_sr, false, null, true);
    end if;
    perform public._save_reading(v_uid, b.room_id, v_er, v_reset, null, true);
  end if;

  v_elec := public._electricity(v_sr, v_er, v_rate, v_split);
  insert into invoices(booking_id, number, period_start, period_end, rent, start_reading, end_reading, rate,
                       split_count, electricity, total)
  values (v_bid, public._next_inv_number(v_uid), v_ps, v_pe, v_rent, v_sr, v_er, v_rate, v_split, v_elec,
          v_rent + v_elec + v_esum) returning id into v_iid;
  for v_ex in select * from jsonb_array_elements(v_extras) loop
    insert into invoice_items(invoice_id, name, amount) values (v_iid, trim(v_ex->>'name'), public._num(v_ex->>'amount'));
  end loop;
  -- new tenant: the advance already paid is taken off this first invoice (rent 5000 + deposit 3000 - advance 2000 = 6000 to pay)
  if coalesce((p->>'apply_advance')::boolean, false) then perform public._apply_advance(v_bid); end if;
  return public._inv_json(v_iid, true);
end $$;

-- ---------- who can call what ----------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'api\_%' or p.proname like '\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'api\_%' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
grant execute on function public.api_phone_status(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
