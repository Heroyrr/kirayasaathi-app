-- =====================================================================
-- KirayaSaathi  |  PART 10: property location (for the RoomIndeed city / locality filter)
--   1. new columns: pincode, state, city, locality, landmark, lat, lng
--   2. property JSON carries them, "go live" needs them
--   3. api_update_listing saves + validates them
--   4. public functions: city / locality / pincode filters, locality list with counts
-- The address is NOT asked when a property is created. It is asked in the Live flow (step 2: Location).
-- Run once after part 9. Safe to run again.
-- =====================================================================

-- ---------- 1. columns ----------
alter table public.properties
  add column if not exists pincode  text,
  add column if not exists state    text,
  add column if not exists city     text,
  add column if not exists locality text,
  add column if not exists landmark text,
  add column if not exists lat      double precision,
  add column if not exists lng      double precision;
create index if not exists properties_loc_idx on public.properties(lower(city), lower(locality)) where is_live;
create index if not exists properties_pin_idx on public.properties(pincode) where is_live;

-- ---------- 2. property JSON + "what is missing" ----------
create or replace function public._prop_row(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'address', p.address,
    'units', u.units, 'occupied', u.occ, 'vacant', greatest(u.units - u.occ, 0),
    'is_live', p.is_live, 'live_at', p.live_at, 'min_rent', p.min_rent, 'security_deposit', p.security_deposit,
    'amenities', to_jsonb(p.amenities), 'unit_types', to_jsonb(p.unit_types), 'photo_keys', to_jsonb(p.photo_keys),
    'pincode', p.pincode, 'state', p.state, 'city', p.city, 'locality', p.locality, 'landmark', p.landmark,
    'lat', p.lat, 'lng', p.lng)
  from properties p
  cross join lateral (select public._prop_units(p.id) as units,
    (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int as occ) u
  where p.id = pid
$$;

-- null = nothing missing. The names match the app (utils/listing.ts)
create or replace function public._listing_problem(pid bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p properties;
begin
  select * into p from properties where id = pid;
  if coalesce(array_length(p.photo_keys, 1), 0) = 0 then return 'photos'; end if;
  if p.min_rent is null or p.min_rent <= 0 then return 'rent'; end if;
  if p.security_deposit is null or p.security_deposit < 0 then return 'deposit'; end if;
  if coalesce(array_length(p.unit_types, 1), 0) = 0 then return 'types'; end if;
  if public._prop_units(pid) = 0 then return 'units'; end if;
  if coalesce(trim(p.pincode), '') !~ '^[1-9][0-9]{5}$' then return 'pincode'; end if;
  if coalesce(trim(p.city), '') = '' then return 'city'; end if;
  if coalesce(trim(p.locality), '') = '' then return 'locality'; end if;
  if coalesce(trim(p.address), '') = '' then return 'address'; end if;
  if p.lat is null or p.lng is null then return 'pin'; end if;
  return null;
end $$;

-- ---------- 3. save the listing (draft). Details and location can be saved separately ----------
create or replace function public.api_update_listing(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id'); pr properties;
  v_rent numeric := public._num(p->>'min_rent'); v_dep numeric := public._num(p->>'security_deposit');
  v_lat numeric := public._num(p->>'lat'); v_lng numeric := public._num(p->>'lng');
  v_pin text := nullif(trim(coalesce(p->>'pincode', '')), '');
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
           select 1 from unnest(v_ph) k where k like '%..%' or length(k) > 300)))
     -- location: pincode is 6 digits, the pin must be inside India, lat and lng always come together
     or (p ? 'pincode' and v_pin is not null and v_pin !~ '^[1-9][0-9]{5}$')
     or ((p ? 'lat') <> (p ? 'lng'))
     or (p ? 'lat' and nullif(p->>'lat', '') is not null and (v_lat is null or v_lat not between 6 and 38))
     or (p ? 'lng' and nullif(p->>'lng', '') is not null and (v_lng is null or v_lng not between 68 and 98))
     or (p ? 'lat' and ((nullif(p->>'lat', '') is null) <> (nullif(p->>'lng', '') is null))) then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;

  update properties set
    min_rent         = case when p ? 'min_rent' then v_rent else min_rent end,
    security_deposit = case when p ? 'security_deposit' then v_dep else security_deposit end,
    amenities        = coalesce(v_am, amenities),
    unit_types       = coalesce(v_ty, unit_types),
    photo_keys       = coalesce(v_ph, photo_keys),
    address          = case when p ? 'address'  then nullif(left(trim(coalesce(p->>'address', '')), 300), '')  else address end,
    pincode          = case when p ? 'pincode'  then v_pin else pincode end,
    state            = case when p ? 'state'    then nullif(left(trim(coalesce(p->>'state', '')), 60), '')     else state end,
    city             = case when p ? 'city'     then nullif(left(trim(coalesce(p->>'city', '')), 80), '')      else city end,
    locality         = case when p ? 'locality' then nullif(left(trim(coalesce(p->>'locality', '')), 80), '')  else locality end,
    landmark         = case when p ? 'landmark' then nullif(left(trim(coalesce(p->>'landmark', '')), 120), '') else landmark end,
    lat              = case when p ? 'lat' then v_lat::double precision else lat end,
    lng              = case when p ? 'lng' then v_lng::double precision else lng end
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

-- ---------- 4. public functions for the RoomIndeed website ----------
create or replace function public._pub_json(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'address', p.address, 'type', p.type,
    'pincode', p.pincode, 'state', p.state, 'city', p.city, 'locality', p.locality, 'landmark', p.landmark,
    -- about 100 m accuracy: enough for a map and distance, not the exact door
    'lat', round(p.lat::numeric, 3), 'lng', round(p.lng::numeric, 3),
    'unit_types', to_jsonb(p.unit_types), 'amenities', to_jsonb(p.amenities), 'photo_keys', to_jsonb(p.photo_keys),
    'min_rent', p.min_rent, 'security_deposit', p.security_deposit, 'live_at', p.live_at,
    'vacant', greatest(public._prop_units(p.id) -
        (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int, 0))
  from properties p where p.id = pid and p.is_live
$$;

-- filters (all optional): type, unit_type, min_rent, max_rent, amenities[], search, limit, offset
--   NEW: city, localities[] (one or many), pincode
create or replace function public.api_public_listings(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim int := least(greatest(coalesce(public._num(p->>'limit'), 20), 1), 50)::int;
  v_off int := greatest(coalesce(public._num(p->>'offset'), 0), 0)::int;
  v_type text := nullif(p->>'type', ''); v_ut text := nullif(p->>'unit_type', '');
  v_min numeric := public._num(p->>'min_rent'); v_max numeric := public._num(p->>'max_rent');
  v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_city text := nullif(lower(trim(coalesce(p->>'city', ''))), '');
  v_pin text := nullif(trim(coalesce(p->>'pincode', '')), '');
  v_loc text[] := case when jsonb_typeof(p->'localities') = 'array' and jsonb_array_length(p->'localities') > 0
                       then array(select lower(trim(x)) from jsonb_array_elements_text(p->'localities') x) end;
  v_am text[] := case when jsonb_typeof(p->'amenities') = 'array' then array(select jsonb_array_elements_text(p->'amenities')) end;
  v_total int; v_items jsonb;
begin
  select count(*) into v_total from properties pr
   where pr.is_live
     and (v_type is null or pr.type = v_type) and (v_ut is null or v_ut = any(pr.unit_types))
     and (v_min is null or pr.min_rent >= v_min) and (v_max is null or pr.min_rent <= v_max)
     and (v_am is null or pr.amenities @> v_am)
     and (v_city is null or lower(pr.city) = v_city)
     and (v_loc is null or lower(pr.locality) = any(v_loc))
     and (v_pin is null or pr.pincode = v_pin)
     and (v_s is null or pr.name ilike '%' || v_s || '%' or pr.address ilike '%' || v_s || '%'
          or pr.locality ilike '%' || v_s || '%' or pr.landmark ilike '%' || v_s || '%' or pr.city ilike '%' || v_s || '%');
  select coalesce(jsonb_agg(public._pub_json(x.id) order by x.live_at desc, x.id desc), '[]'::jsonb) into v_items
    from (select pr.id, pr.live_at from properties pr
           where pr.is_live
             and (v_type is null or pr.type = v_type) and (v_ut is null or v_ut = any(pr.unit_types))
             and (v_min is null or pr.min_rent >= v_min) and (v_max is null or pr.min_rent <= v_max)
             and (v_am is null or pr.amenities @> v_am)
             and (v_city is null or lower(pr.city) = v_city)
             and (v_loc is null or lower(pr.locality) = any(v_loc))
             and (v_pin is null or pr.pincode = v_pin)
             and (v_s is null or pr.name ilike '%' || v_s || '%' or pr.address ilike '%' || v_s || '%'
                  or pr.locality ilike '%' || v_s || '%' or pr.landmark ilike '%' || v_s || '%' or pr.city ilike '%' || v_s || '%')
           order by pr.live_at desc, pr.id desc limit v_lim offset v_off) x;
  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

-- for the website's location filter: only places that really have a live property, with the count.
-- body (optional): { city }   ->   [ { city, locality, count } ]
create or replace function public.api_public_localities(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'locality', x.locality, 'count', x.n)
                            order by x.n desc, x.locality), '[]'::jsonb)
  from (select initcap(lower(pr.city)) as city, initcap(lower(pr.locality)) as locality, count(*)::int as n
          from properties pr
         where pr.is_live and coalesce(trim(pr.city), '') <> '' and coalesce(trim(pr.locality), '') <> ''
           and (nullif(lower(trim(coalesce(p->>'city', ''))), '') is null or lower(pr.city) = lower(trim(p->>'city')))
         group by 1, 2) x
$$;

-- ---------- who can call what (new function only; the others keep their grants) ----------
revoke all on function public.api_public_localities(jsonb) from public, anon, authenticated;
grant execute on function public.api_public_localities(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
