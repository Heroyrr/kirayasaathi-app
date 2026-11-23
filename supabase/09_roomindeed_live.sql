-- =====================================================================
-- KirayaSaathi  |  PART 9: RoomIndeed collab
--   1. property "Live" listing (photos, address, min rent, deposit, amenities, property types)
--   2. leads with MANY properties (also leads that come from the RoomIndeed website)
--   3. public functions for the RoomIndeed website (listings + enquiry)
--   4. notice reminders on Home, notice/leave dates on the tenant list
-- Run once after part 8. Safe to run again.
-- =====================================================================

-- ---------- 1. listing columns ----------
alter table public.properties
  add column if not exists is_live           boolean not null default false,
  add column if not exists live_at           timestamptz,
  add column if not exists min_rent          numeric,
  add column if not exists security_deposit  numeric,
  add column if not exists amenities         text[] not null default '{}',
  add column if not exists unit_types        text[] not null default '{}',
  add column if not exists photo_keys        text[] not null default '{}';
create index if not exists properties_live_idx on public.properties(is_live) where is_live;

-- listing photos must be readable by the public website, so they live in their own PUBLIC bucket
insert into storage.buckets (id, name, public) values ('listings', 'listings', true)
on conflict (id) do update set public = true;

drop policy if exists "anyone views listing photos"  on storage.objects;
drop policy if exists "owner uploads listing photos" on storage.objects;
drop policy if exists "owner updates listing photos" on storage.objects;
drop policy if exists "owner deletes listing photos" on storage.objects;
create policy "anyone views listing photos"  on storage.objects for select to anon, authenticated
  using (bucket_id = 'listings');
create policy "owner uploads listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates listing photos" on storage.objects for update to authenticated
  using (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2. leads: many properties ----------
alter table public.leads add column if not exists source text not null default 'app';  -- 'app' | 'roomindeed'

create table if not exists public.lead_properties (
  lead_id      bigint not null references public.leads(id) on delete cascade,
  property_id  bigint not null references public.properties(id) on delete cascade,
  primary key (lead_id, property_id)
);
create index if not exists lead_properties_prop_idx on public.lead_properties(property_id);
alter table public.lead_properties enable row level security;
revoke all on public.lead_properties from anon, authenticated;

-- old leads had one property: carry it over
insert into public.lead_properties(lead_id, property_id)
select id, property_id from public.leads where property_id is not null
on conflict do nothing;

-- replaces the property list of a lead. leads.property_id keeps the FIRST one (older code still reads it).
create or replace function public._set_lead_props(lid bigint, uid bigint, ids jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_first bigint;
begin
  if jsonb_typeof(ids) is distinct from 'array' then return; end if;
  delete from lead_properties where lead_id = lid;
  for v_id in
    select distinct public._bid(e.value) from jsonb_array_elements_text(ids) e(value)
     where public._bid(e.value) is not null order by 1
  loop
    perform public._chk_property(v_id, uid);
    insert into lead_properties(lead_id, property_id) values (lid, v_id) on conflict do nothing;
    if v_first is null then v_first := v_id; end if;
  end loop;
  update leads set property_id = v_first where id = lid;
end $$;

create or replace function public._lead_json(lid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'property_id', l.property_id,
    'property', (select jsonb_build_object('id', pr.id, 'name', pr.name)
                   from lead_properties lp join properties pr on pr.id = lp.property_id
                  where lp.lead_id = l.id order by pr.id limit 1),
    'properties', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name) order by pr.id)
                   from lead_properties lp join properties pr on pr.id = lp.property_id
                  where lp.lead_id = l.id), '[]'::jsonb),
    'source', l.source,
    'note', l.note, 'status', l.status, 'last_talk', l.last_talk, 'last_talk_at', l.last_talk_at,
    'next_action', l.next_action, 'next_action_at', l.next_action_at, 'created_at', l.created_at)
  from leads l where l.id = lid
$$;

create or replace function public.api_add_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_id bigint; v_ids jsonb;
begin
  perform public._assert_write(v_uid);
  if coalesce(trim(p->>'name'), '') = '' or v_ph is null or v_ph !~ '^[6-9][0-9]{9}$' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  v_ids := case when jsonb_typeof(p->'property_ids') = 'array' then p->'property_ids'
                when nullif(p->>'property_id', '') is not null then jsonb_build_array(p->>'property_id')
                else '[]'::jsonb end;
  insert into leads(user_id, name, phone, note, status, source)
  values (v_uid, trim(p->>'name'), v_ph, nullif(trim(coalesce(p->>'note', '')), ''), 'pending', 'app') returning id into v_id;
  perform public._set_lead_props(v_id, v_uid, v_ids);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_update_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id'); l leads;
  v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_date date := public._date(p->>'next_action_at');
  v_talk text := case when p ? 'last_talk' then nullif(trim(coalesce(p->>'last_talk', '')), '') else null end;
  v_act  text := case when p ? 'next_action' then nullif(trim(coalesce(p->>'next_action', '')), '') else null end;
  v_due  date;
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
  v_due := case when p ? 'next_action_at' then v_date else l.next_action_at end;

  if v_talk is not null then insert into lead_logs(lead_id, kind, text) values (v_id, 'talk', v_talk); end if;
  if v_act  is not null then insert into lead_logs(lead_id, kind, text, due_date) values (v_id, 'next', v_act, v_due); end if;

  update leads set
    name           = case when p ? 'name' then trim(p->>'name') else name end,
    phone          = case when p ? 'phone' then v_ph else phone end,
    note           = case when p ? 'note' then nullif(trim(coalesce(p->>'note', '')), '') else note end,
    status         = case when p ? 'status' then p->>'status' else status end,
    last_talk      = coalesce(v_talk, last_talk),
    last_talk_at   = case when v_talk is not null then now() else last_talk_at end,
    next_action    = coalesce(v_act, next_action),
    next_action_at = v_due
  where id = v_id;

  if jsonb_typeof(p->'property_ids') = 'array' then
    perform public._set_lead_props(v_id, v_uid, p->'property_ids');
  elsif p ? 'property_id' then  -- older app versions send one property
    perform public._set_lead_props(v_id, v_uid,
      case when nullif(p->>'property_id', '') is null then '[]'::jsonb else jsonb_build_array(p->>'property_id') end);
  end if;
  return public._lead_json(v_id);
end $$;

-- the lead list also finds leads by any of their property names
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
     and (v_s is null or l.name ilike '%' || v_s || '%' or (v_d <> '' and l.phone like '%' || v_d || '%')
          or exists (select 1 from lead_properties lp join properties pr on pr.id = lp.property_id
                      where lp.lead_id = l.id and pr.name ilike '%' || v_s || '%'))
     and (v_date is null or l.next_action_at = v_date);
  select coalesce(jsonb_agg(public._lead_json(x.id) order by x.next_action_at nulls last, x.id desc), '[]'::jsonb) into v_list
    from leads x
   where x.user_id = v_uid
     and (v_st is null or x.status = v_st)
     and (v_s is null or x.name ilike '%' || v_s || '%' or (v_d <> '' and x.phone like '%' || v_d || '%')
          or exists (select 1 from lead_properties lp join properties pr on pr.id = lp.property_id
                      where lp.lead_id = x.id and pr.name ilike '%' || v_s || '%'))
     and (v_date is null or x.next_action_at = v_date);
  return jsonb_build_object('counts', v_counts, 'leads', v_list);
end $$;

-- ---------- property JSON now carries the listing fields ----------
create or replace function public._prop_row(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'address', p.address,
    'units', u.units, 'occupied', u.occ, 'vacant', greatest(u.units - u.occ, 0),
    'is_live', p.is_live, 'live_at', p.live_at, 'min_rent', p.min_rent, 'security_deposit', p.security_deposit,
    'amenities', to_jsonb(p.amenities), 'unit_types', to_jsonb(p.unit_types), 'photo_keys', to_jsonb(p.photo_keys))
  from properties p
  cross join lateral (select public._prop_units(p.id) as units,
    (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int as occ) u
  where p.id = pid
$$;

-- what is still missing before a property can go live (null = nothing)
create or replace function public._listing_problem(pid bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p properties;
begin
  select * into p from properties where id = pid;
  if coalesce(trim(p.address), '') = '' then return 'address'; end if;
  if coalesce(array_length(p.photo_keys, 1), 0) = 0 then return 'photos'; end if;
  if p.min_rent is null or p.min_rent <= 0 then return 'rent'; end if;
  if p.security_deposit is null or p.security_deposit < 0 then return 'deposit'; end if;
  if coalesce(array_length(p.unit_types, 1), 0) = 0 then return 'types'; end if;
  if public._prop_units(pid) = 0 then return 'units'; end if;
  return null;
end $$;

-- save the listing details (a draft: the property does not go live by this)
create or replace function public.api_update_listing(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id'); pr properties;
  v_rent numeric := public._num(p->>'min_rent'); v_dep numeric := public._num(p->>'security_deposit');
  v_am text[]; v_ty text[]; v_ph text[]; v_allowed text[]; v_bad text;
  v_all_am constant text[] := array['ac','car_parking','bike_parking','bed','mattress','wifi','geyser','fridge','tv',
    'washing_machine','wardrobe','power_backup','lift','cctv','meals','housekeeping','attached_bath','balcony','ro_water'];
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  select * into pr from properties where id = v_pid;

  v_am := case when jsonb_typeof(p->'amenities')  = 'array' then array(select distinct jsonb_array_elements_text(p->'amenities')) end;
  v_ty := case when jsonb_typeof(p->'unit_types') = 'array' then array(select distinct jsonb_array_elements_text(p->'unit_types')) end;
  v_ph := case when jsonb_typeof(p->'photo_keys') = 'array' then array(select jsonb_array_elements_text(p->'photo_keys')) end;
  v_allowed := case when pr.type = 'BED' then array['hostel','pg'] else array['private_room','1rk','1bhk','2bhk','3bhk'] end;

  if (p ? 'min_rent' and (v_rent is null or v_rent <= 0))
     or (p ? 'security_deposit' and (v_dep is null or v_dep < 0))
     or (v_am is not null and not (v_am <@ v_all_am))
     or (v_ty is not null and not (v_ty <@ v_allowed))
     or (v_ph is not null and (coalesce(array_length(v_ph, 1), 0) > 10 or exists (
           select 1 from unnest(v_ph) k where k like '%..%' or length(k) > 300))) then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;

  update properties set
    address          = case when p ? 'address' then nullif(trim(coalesce(p->>'address', '')), '') else address end,
    min_rent         = case when p ? 'min_rent' then v_rent else min_rent end,
    security_deposit = case when p ? 'security_deposit' then v_dep else security_deposit end,
    amenities        = coalesce(v_am, amenities),
    unit_types       = coalesce(v_ty, unit_types),
    photo_keys       = coalesce(v_ph, photo_keys)
  where id = v_pid;

  -- a live property must stay complete
  if pr.is_live then
    v_bad := public._listing_problem(v_pid);
    if v_bad is not null then
      perform public._err('LISTING_INCOMPLETE', 'A live property needs: ' || v_bad || '. Take it offline first or complete the details.');
    end if;
  end if;
  return public._prop_row(v_pid);
end $$;

-- go live (after the owner checked everything) or take it offline
create or replace function public.api_set_live(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
  v_live boolean := coalesce((p->>'live')::boolean, false); v_bad text;
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  if v_live then
    v_bad := public._listing_problem(v_pid);
    if v_bad is not null then
      perform public._err('LISTING_INCOMPLETE', 'Complete the listing first. Missing: ' || v_bad || '.');
    end if;
    update properties set is_live = true, live_at = coalesce(live_at, now()) where id = v_pid;
  else
    update properties set is_live = false where id = v_pid;
  end if;
  return public._prop_row(v_pid);
end $$;

-- ---------- 3. public functions for the RoomIndeed website (no login) ----------
create or replace function public._pub_json(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'address', p.address, 'type', p.type,
    'unit_types', to_jsonb(p.unit_types), 'amenities', to_jsonb(p.amenities), 'photo_keys', to_jsonb(p.photo_keys),
    'min_rent', p.min_rent, 'security_deposit', p.security_deposit, 'live_at', p.live_at,
    'vacant', greatest(public._prop_units(p.id) -
        (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int, 0))
  from properties p where p.id = pid and p.is_live
$$;

-- filters (all optional): type BED|NON_BED, unit_type, min_rent, max_rent, amenities[], search, limit, offset
-- photo_keys are paths in the public "listings" bucket: <SUPABASE_URL>/storage/v1/object/public/listings/<key>
create or replace function public.api_public_listings(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim int := least(greatest(coalesce(public._num(p->>'limit'), 20), 1), 50)::int;
  v_off int := greatest(coalesce(public._num(p->>'offset'), 0), 0)::int;
  v_type text := nullif(p->>'type', ''); v_ut text := nullif(p->>'unit_type', '');
  v_min numeric := public._num(p->>'min_rent'); v_max numeric := public._num(p->>'max_rent');
  v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_am text[] := case when jsonb_typeof(p->'amenities') = 'array' then array(select jsonb_array_elements_text(p->'amenities')) end;
  v_total int; v_items jsonb;
begin
  select count(*) into v_total from properties pr
   where pr.is_live
     and (v_type is null or pr.type = v_type) and (v_ut is null or v_ut = any(pr.unit_types))
     and (v_min is null or pr.min_rent >= v_min) and (v_max is null or pr.min_rent <= v_max)
     and (v_am is null or pr.amenities @> v_am)
     and (v_s is null or pr.name ilike '%' || v_s || '%' or pr.address ilike '%' || v_s || '%');
  select coalesce(jsonb_agg(public._pub_json(x.id) order by x.live_at desc, x.id desc), '[]'::jsonb) into v_items
    from (select pr.id, pr.live_at from properties pr
           where pr.is_live
             and (v_type is null or pr.type = v_type) and (v_ut is null or v_ut = any(pr.unit_types))
             and (v_min is null or pr.min_rent >= v_min) and (v_max is null or pr.min_rent <= v_max)
             and (v_am is null or pr.amenities @> v_am)
             and (v_s is null or pr.name ilike '%' || v_s || '%' or pr.address ilike '%' || v_s || '%')
           order by pr.live_at desc, pr.id desc limit v_lim offset v_off) x;
  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

create or replace function public.api_public_listing(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_pid bigint := public._bid(p->>'id'); v_j jsonb;
begin
  v_j := public._pub_json(v_pid);
  if v_j is null then perform public._nf(); end if;
  return v_j;
end $$;

-- the "Enquiry" button on a RoomIndeed property card / detail page.
-- body: { property_id | property_ids[], name, phone, message? }
-- Every owner gets the lead with the property name(s). Same person + same owner within 24 h = one lead.
create or replace function public.api_public_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_name text := left(trim(coalesce(p->>'name', '')), 80);
  v_msg text := nullif(left(trim(coalesce(p->>'message', '')), 500), '');
  v_ids bigint[]; r record; v_lid bigint; v_n int := 0;
begin
  if v_name = '' or v_ph is null or v_ph !~ '^[6-9][0-9]{9}$' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  v_ids := array(select distinct public._bid(e.value)
                   from jsonb_array_elements_text(
                          case when jsonb_typeof(p->'property_ids') = 'array' then p->'property_ids'
                               when nullif(p->>'property_id', '') is not null then jsonb_build_array(p->>'property_id')
                               else '[]'::jsonb end) e(value)
                  where public._bid(e.value) is not null);
  if coalesce(array_length(v_ids, 1), 0) = 0 or array_length(v_ids, 1) > 5 then
    perform public._err('E_VALIDATION', 'Please choose 1 to 5 properties.');
  end if;
  -- simple spam guard (a CAPTCHA on the website is still recommended)
  if (select count(*) from leads where phone = v_ph and source = 'roomindeed' and created_at > now() - interval '1 hour') >= 5 then
    perform public._err('TOO_MANY', 'Too many enquiries. Please try again later.', 429);
  end if;

  for r in
    select pr.user_id, array_agg(pr.id order by pr.id) as pids
      from properties pr where pr.id = any(v_ids) and pr.is_live group by pr.user_id
  loop
    select id into v_lid from leads
     where user_id = r.user_id and phone = v_ph and status in ('pending','processing')
       and created_at > now() - interval '24 hours' order by id desc limit 1;
    if v_lid is null then
      insert into leads(user_id, name, phone, note, status, source)
      values (r.user_id, v_name, v_ph, 'RoomIndeed enquiry' || coalesce(': ' || v_msg, ''), 'pending', 'roomindeed')
      returning id into v_lid;
    elsif v_msg is not null then
      update leads set note = coalesce(note || E'\n', '') || v_msg where id = v_lid;
    end if;
    insert into lead_properties(lead_id, property_id) select v_lid, unnest(r.pids) on conflict do nothing;
    update leads set property_id = coalesce(property_id, r.pids[1]) where id = v_lid;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then perform public._err('NOT_LIVE', 'This property is not available now.', 404); end if;
  return jsonb_build_object('ok', true, 'leads', v_n);
end $$;

-- ---------- 4. tenant list shows notice + leave date, Home reminds about leaving tenants ----------
create or replace function public._tenant_row(tid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone, 'photo_key', t.photo_key,
    'ekyc_done', (select count(distinct d.kind) from tenant_documents d
                  where d.tenant_id = t.id and d.kind in ('aadhaar_front','aadhaar_back')) = 2,
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tenant_id', d.tenant_id, 'kind', d.kind,
                  'file_key', d.file_key, 'mime_type', d.mime_type) order by d.id)
                  from tenant_documents d where d.tenant_id = t.id), '[]'::jsonb),
    'live_bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status,
                  'property_name', p.name, 'room_no', r.room_no, 'bed_label', bd.label,
                  'notice_date', b.notice_date, 'leave_date', b.leave_date,
                  'balance', public._bk_balance(b.id), 'agreement_done', b.agreement_file_key is not null) order by b.id)
                  from bookings b join properties p on p.id = b.property_id join rooms r on r.id = b.room_id
                  left join beds bd on bd.id = b.bed_id
                  where b.tenant_id = t.id and b.status <> 'moved_out'), '[]'::jsonb),
    'bookings_count', (select count(*) from bookings b where b.tenant_id = t.id),
    'total_balance', coalesce((select sum(public._bk_balance(b.id)) from bookings b where b.tenant_id = t.id), 0))
  from tenants t where t.id = tid
$$;

create or replace function public.api_home(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_units int; v_occ int; v_dues numeric; v_dn int; v_col numeric;
begin
  select coalesce(sum(public._prop_units(id)), 0) into v_units from properties where user_id = v_uid;
  select count(*) into v_occ from bookings b join properties pr on pr.id = b.property_id
   where pr.user_id = v_uid and b.status <> 'moved_out';
  select coalesce(sum(bal), 0), count(*) into v_dues, v_dn from (
    select public._bk_balance(b.id) as bal from bookings b join properties pr on pr.id = b.property_id
    where pr.user_id = v_uid) x where bal > 0;
  select coalesce(sum(pm.amount), 0) into v_col from payments pm
    join bookings b on b.id = pm.booking_id join properties pr on pr.id = b.property_id
   where pr.user_id = v_uid and date_trunc('month', pm.paid_on) = date_trunc('month', current_date);
  return jsonb_build_object(
    'dues_total', v_dues, 'dues_bookings', v_dn, 'collected_this_month', v_col,
    'units', v_units, 'occupied', v_occ, 'vacant', greatest(v_units - v_occ, 0),
    'leads_pending', (select count(*) from leads where user_id = v_uid and status in ('pending','processing')),
    'reminders', jsonb_build_object(
      'leads', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone,
                 'next_action', l.next_action, 'next_action_at', l.next_action_at) order by l.next_action_at)
               from (select * from leads where user_id = v_uid and status in ('pending','processing')
                     and next_action_at is not null order by next_action_at limit 5) l), '[]'::jsonb),
      'complaints', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'service', c.service, 'remind_at', c.remind_at,
                 'property', jsonb_build_object('id', pr.id, 'name', pr.name)) order by c.remind_at)
               from (select * from complaints where status in ('pending','processing') and remind_at is not null
                     and property_id in (select id from properties where user_id = v_uid)
                     order by remind_at limit 5) c join properties pr on pr.id = c.property_id), '[]'::jsonb),
      -- tenants on notice who leave within 7 days (or should have left already)
      'notices', coalesce((select jsonb_agg(jsonb_build_object('booking_id', b.id, 'tenant_id', b.tenant_id,
                 'tenant_name', t.name, 'property_name', pr.name, 'room_no', r.room_no, 'bed_label', bd.label,
                 'leave_date', b.leave_date, 'notice_date', b.notice_date) order by b.leave_date)
               from bookings b join tenants t on t.id = b.tenant_id join properties pr on pr.id = b.property_id
               join rooms r on r.id = b.room_id left join beds bd on bd.id = b.bed_id
               where pr.user_id = v_uid and b.status = 'notice' and b.leave_date is not null
                 and b.leave_date <= current_date + 7), '[]'::jsonb)),
    'subscription', public._sub(v_uid));
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
-- the RoomIndeed website calls these with the anon key (no login)
grant execute on function public.api_public_listings(jsonb) to anon, authenticated;
grant execute on function public.api_public_listing(jsonb)  to anon, authenticated;
grant execute on function public.api_public_enquiry(jsonb)  to anon, authenticated;

notify pgrst, 'reload schema';
