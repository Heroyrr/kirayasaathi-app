-- =====================================================================
-- KirayaSaathi  |  PART 18: partner branding on invoices, "live on" websites, lead source name
--   1. partners.site_url / partners.search_url     (where "See live" opens)
--      app_config.main_site_*                      (GharSaathi: your main website)
--   2. /me carries the owner's partner (name + logo) -> the invoice shows it on top
--   3. every property carries share_url (<main site>/<id>, for the WhatsApp share) and live_sites = the websites it shows on
--        main site (GharSaathi) always, then the owner's own partner site,
--        then partner sites that also show your own owners (show_kirayasaathi = true)
--   4. leads: the source is now the website slug (roomindeed, gharsaathi, roomwala ...) and the
--      lead JSON carries source_name, so the lead card can say "From RoomWala"
--   5. api_public_enquiry takes an optional  site  ("roomindeed", "gharsaathi", a partner slug)
--      No site = RoomIndeed (so the website that exists today keeps working without a change)
--   6. the push for a new lead now fires for EVERY website, not only RoomIndeed
-- Run once after part 17. Safe to run again.
-- =====================================================================

-- ---------- 1. where "See live" opens ----------
alter table public.partners
  add column if not exists site_url   text,    -- https://roomindeed.com
  add column if not exists search_url text;    -- optional, {q} = property name, e.g. https://roomindeed.com/rooms?search={q}

alter table public.app_config
  add column if not exists main_site_name  text not null default 'GharSaathi',
  add column if not exists main_site_url   text,
  add column if not exists main_search_url text;

-- the address "See live" opens. {q} is replaced by the app with the property name.
-- no search_url set  ->  <site_url>/?search={q}
create or replace function public._site_template(p_search text, p_site text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(p_search), ''),
    case when nullif(trim(p_site), '') is not null then rtrim(trim(p_site), '/') || '/?search={q}' end)
$$;

-- ---------- 3. the websites a property shows on ----------
-- owner_partner = users.partner_id of the property's owner (null = your own owner)
create or replace function public._live_sites(owner_partner bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x.j order by x.ord, x.nm), '[]'::jsonb)
  from (
    select 0 as ord, c.main_site_name as nm,
           jsonb_build_object('slug', 'gharsaathi', 'name', c.main_site_name, 'logo_key', null::text, 'main', true,
                              'url_template', public._site_template(c.main_search_url, c.main_site_url)) as j
      from app_config c where c.id = 1
    union all
    select case when s.id = owner_partner then 1 else 2 end, s.name,
           jsonb_build_object('slug', s.slug, 'name', s.name, 'logo_key', s.logo_key, 'main', false,
                              'url_template', public._site_template(s.search_url, s.site_url))
      from partners s
     where s.id = owner_partner or (s.show_kirayasaathi and owner_partner is null)
  ) x
$$;
revoke all on function public._live_sites(bigint) from public, anon, authenticated;

-- property JSON (list + detail) now carries live_sites
create or replace function public._prop_row(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'address', p.address,
    'units', u.units, 'occupied', u.occ, 'vacant', greatest(u.units - u.occ, 0),
    'is_live', p.is_live, 'live_at', p.live_at, 'min_rent', p.min_rent, 'security_deposit', p.security_deposit,
    'amenities', to_jsonb(p.amenities), 'unit_types', to_jsonb(p.unit_types), 'photo_keys', to_jsonb(p.photo_keys),
    'pincode', p.pincode, 'state', p.state, 'city', p.city, 'locality', p.locality, 'landmark', p.landmark,
    'lat', p.lat, 'lng', p.lng,
    'live_sites', public._live_sites((select o.partner_id from users o where o.id = p.user_id)),
    -- the link the owner shares on WhatsApp: <main site>/<property id>  (null until the main site address is set, or while not live)
    'share_url', case when p.is_live then
        (select rtrim(trim(c.main_site_url), '/') || '/' || p.id
           from app_config c where c.id = 1 and nullif(trim(c.main_site_url), '') is not null) end)
  from properties p
  cross join lateral (select public._prop_units(p.id) as units,
    (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int as occ) u
  where p.id = pid
$$;

-- ---------- 2. the owner's partner (invoice header) ----------
create or replace function public._user_json(u users) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email, 'language', u.language,
    'partner', (select jsonb_build_object('name', pa.name, 'slug', pa.slug, 'logo_key', pa.logo_key)
                  from partners pa where pa.id = u.partner_id))
$$;

-- ---------- 4. lead source ----------
-- 'app' -> null (added by hand), 'gharsaathi' -> main site name, a partner slug -> partner name
create or replace function public._lead_source_name(src text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when src is null or src = 'app' then null
    when src in ('gharsaathi', 'kirayasaathi') then coalesce((select main_site_name from app_config where id = 1), 'GharSaathi')
    else coalesce((select name from partners where slug = src), initcap(src))
  end
$$;
revoke all on function public._lead_source_name(text) from public, anon, authenticated;

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
    'source_name', public._lead_source_name(l.source),
    'note', l.note, 'status', l.status, 'last_talk', l.last_talk, 'last_talk_at', l.last_talk_at,
    'next_action', l.next_action, 'next_action_at', l.next_action_at, 'created_at', l.created_at)
  from leads l where l.id = lid
$$;

-- ---------- 5. the "Enquiry" button on ANY website ----------
-- body: { property_id | property_ids[], name, phone, message?, site? }
--   site: "roomindeed" | "gharsaathi" | a partner slug.  No site = roomindeed (the website that exists today).
-- Every owner gets the lead with the property name(s). Same person + same owner within 24 h = one lead.
create or replace function public.api_public_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_name text := left(trim(coalesce(p->>'name', '')), 80);
  v_msg text := nullif(left(trim(coalesce(p->>'message', '')), 500), '');
  v_site text := nullif(lower(trim(coalesce(p->>'site', ''))), '');
  v_src text; v_src_name text;
  v_ids bigint[]; r record; v_lid bigint; v_n int := 0;
begin
  if v_name = '' or v_ph is null or v_ph !~ '^[6-9][0-9]{9}$' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;

  v_src := case
    when v_site is null then 'roomindeed'
    when v_site in ('gharsaathi', 'kirayasaathi') then 'gharsaathi'
    when exists (select 1 from partners where slug = v_site) then v_site
    else null end;
  if v_src is null then perform public._err('E_VALIDATION', 'Unknown website.'); end if;
  v_src_name := coalesce(public._lead_source_name(v_src), 'Website');

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
  if (select count(*) from leads where phone = v_ph and source <> 'app' and created_at > now() - interval '1 hour') >= 5 then
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
      values (r.user_id, v_name, v_ph, v_src_name || ' enquiry' || coalesce(': ' || v_msg, ''), 'pending', v_src)
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
grant execute on function public.api_public_enquiry(jsonb) to anon, authenticated;

-- ---------- 6. push for a new lead from ANY website (the app's own "add lead" stays silent) ----------
create or replace function public._lead_push_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source <> 'app' then
    perform public._push_send(
      array[new.user_id],
      'New lead from ' || coalesce(public._lead_source_name(new.source), 'website'),
      new.name || ' · +91 ' || coalesce(new.phone, ''),
      jsonb_build_object('type', 'lead', 'lead_id', new.id, 'url', '/leads/' || new.id));
  end if;
  return new;
exception when others then
  raise warning 'lead push failed: %', sqlerrm;
  return new;      -- the lead is always saved
end $$;
revoke all on function public._lead_push_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- HOW TO USE  (run by hand in the Supabase SQL Editor)
-- =====================================================================
-- A) your main website (GharSaathi): name + address. Change it here when the domain is ready, the app needs no update.
--    "Share property" sends  <main_site_url>/<property id>   (the website must open  domain/<id>  and redirect to the SEO page)
--    "See live" opens        <main_site_url>/?search=<property name>   (or main_search_url, where {q} = name and {id} = property id)
--      update app_config set main_site_name = 'GharSaathi', main_site_url = 'https://YOUR-GHARSAATHI-DOMAIN' where id = 1;
--    if your search page is not /?search=  give the full address, {q} = property name:
--      update app_config set main_search_url = 'https://YOUR-DOMAIN/search?q={q}' where id = 1;
--
-- B) a partner website (RoomIndeed, RoomWala ...)
--      update partners set site_url = 'https://roomindeed.com' where slug = 'roomindeed';
--      update partners set search_url = 'https://roomindeed.com/rooms?search={q}' where slug = 'roomindeed';   -- only if needed
--
-- C) partner LOGO (shown on the invoice header + in the "See live" popup)
--      1. Supabase > Storage > bucket "listings" (public) > upload  partners/roomindeed.png
--      2. update partners set logo_key = 'partners/roomindeed.png' where slug = 'roomindeed';
--    Square PNG, about 200 x 200, is best. Without a logo the invoice shows the first letter of the name.
--
-- D) websites send the lead source: body of api_public_enquiry gets   "site": "roomindeed" | "gharsaathi" | "<partner slug>"
-- =====================================================================
