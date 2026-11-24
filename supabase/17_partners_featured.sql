-- =====================================================================
-- KirayaSaathi  |  PART 17: partners (company OR single owner with his own website) + featured boost
--   1. partners table + users.partner_id   (the tag lives on the OWNER, so all his properties get it)
--   2. properties.featured_until + properties.rank_boost   (paid / manual "Featured")
--   3. public JSON carries listed_by, partner, is_featured
--   4. api_public_listings + api_public_localities get a new optional key  site
-- Run once after part 16. Safe to run again (it replaces an earlier run of this same file).
-- The owner app and the old APK are NOT touched: no owner function is changed.
--
-- WHO IS A PARTNER?  Anyone who has his own website: a company (RoomWala, RoomIndeed)
-- or one owner with 5 properties. Same table, same steps.
--
-- WHAT EACH WEBSITE SHOWS  (the website sends  "site": "<slug>"):
--   main KirayaSaathi site  (no site, or "kirayasaathi")
--        everything live. Order: Featured first, then all others, newest first.
--        The partner name is only a tag on the card, it does not change the order.
--   a partner's site  ("site": "roomwala")
--        1) the partner's own properties   (featured first, then newest)
--        2) only if partners.show_kirayasaathi = true: your own owners' properties
--           (featured first, then newest)
--        never another partner's properties.
-- =====================================================================

-- ---------- 1. partners ----------
create table if not exists public.partners (
  id                 bigint generated always as identity primary key,
  name               text   not null,                       -- shown on the card, e.g. RoomWala
  slug               text   not null unique check (slug ~ '^[a-z0-9-]+$'),   -- the "site" key, e.g. roomwala
  logo_key           text,                                  -- optional: path in the public "listings" bucket
  show_kirayasaathi  boolean not null default false,        -- true = this partner's site ALSO shows your own owners below its own
  created_at         timestamptz not null default now()
);
alter table public.partners add column if not exists show_kirayasaathi boolean not null default false;
-- (an earlier run of this file made partners.rank_boost; it is not used any more and does no harm)
alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;

alter table public.users
  add column if not exists partner_id bigint references public.partners(id) on delete set null;
create index if not exists users_partner_idx on public.users(partner_id) where partner_id is not null;

-- ---------- 2. featured / boost ----------
alter table public.properties
  add column if not exists featured_until timestamptz,            -- featured while this is in the future
  add column if not exists rank_boost     int not null default 0; -- small manual push inside the same group, bigger = higher
create index if not exists properties_featured_idx on public.properties(featured_until) where is_live and featured_until is not null;

-- ---------- helpers: which site sees which owner ----------
-- owner_partner = users.partner_id of the property's owner (null = your own owner)
create or replace function public._site_sees(owner_partner bigint, site text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when site is null or site = 'kirayasaathi' then true
    else exists (select 1 from partners s
                  where s.slug = site and (s.id = owner_partner or (s.show_kirayasaathi and owner_partner is null)))
  end
$$;

-- 0 = the site's own group (shown first), 1 = your owners shown below a partner's own
create or replace function public._site_group(owner_partner bigint, site text) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when site is null or site = 'kirayasaathi' then 0
    when exists (select 1 from partners s where s.slug = site and s.id = owner_partner) then 0
    else 1
  end
$$;
revoke all on function public._site_sees(bigint, text)  from public, anon, authenticated;
revoke all on function public._site_group(bigint, text) from public, anon, authenticated;

-- ---------- 3. public property JSON ----------
-- new keys: listed_by (partner name, or 'KirayaSaathi'), partner {name, slug, logo_key} or null, is_featured
create or replace function public._pub_json(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'address', p.address, 'type', p.type,
    'pincode', p.pincode, 'state', p.state, 'city', p.city, 'locality', p.locality, 'landmark', p.landmark,
    -- about 100 m accuracy: enough for a map and distance, not the exact door
    'lat', round(p.lat::numeric, 3), 'lng', round(p.lng::numeric, 3),
    'unit_types', to_jsonb(p.unit_types), 'amenities', to_jsonb(p.amenities), 'photo_keys', to_jsonb(p.photo_keys),
    'min_rent', p.min_rent, 'security_deposit', p.security_deposit, 'live_at', p.live_at,
    'vacant', greatest(public._prop_units(p.id) -
        (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int, 0),
    'listed_by', coalesce(pa.name, 'KirayaSaathi'),
    'partner', case when pa.id is null then null
                    else jsonb_build_object('name', pa.name, 'slug', pa.slug, 'logo_key', pa.logo_key) end,
    'is_featured', coalesce(p.featured_until > now(), false))
  from properties p
  join users u on u.id = p.user_id
  left join partners pa on pa.id = u.partner_id
  where p.id = pid and p.is_live
$$;

-- ---------- 4. public list ----------
-- filters (all optional): type, unit_type, min_rent, max_rent, amenities[], search, city, localities[], pincode, limit, offset
--   NEW: site -> "roomwala" / "roomindeed" / ... (a partner slug) or "kirayasaathi" / nothing for the main site
-- an unknown site slug returns an empty list
create or replace function public.api_public_listings(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim int := least(greatest(coalesce(public._num(p->>'limit'), 20), 1), 50)::int;
  v_off int := greatest(coalesce(public._num(p->>'offset'), 0), 0)::int;
  v_type text := nullif(p->>'type', ''); v_ut text := nullif(p->>'unit_type', '');
  v_min numeric := public._num(p->>'min_rent'); v_max numeric := public._num(p->>'max_rent');
  v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_city text := nullif(lower(trim(coalesce(p->>'city', ''))), '');
  v_pin text := nullif(trim(coalesce(p->>'pincode', '')), '');
  v_site text := nullif(lower(trim(coalesce(p->>'site', ''))), '');
  v_loc text[] := case when jsonb_typeof(p->'localities') = 'array' and jsonb_array_length(p->'localities') > 0
                       then array(select lower(trim(x)) from jsonb_array_elements_text(p->'localities') x) end;
  v_am text[] := case when jsonb_typeof(p->'amenities') = 'array' then array(select jsonb_array_elements_text(p->'amenities')) end;
  v_total int; v_items jsonb;
begin
  with f as (
    select pr.id, pr.live_at,
           coalesce(pr.featured_until > now(), false) as feat,
           pr.rank_boost as boost,
           public._site_group(u.partner_id, v_site) as grp
      from properties pr
      join users u on u.id = pr.user_id
     where pr.is_live
       and public._site_sees(u.partner_id, v_site)
       and (v_type is null or pr.type = v_type) and (v_ut is null or v_ut = any(pr.unit_types))
       and (v_min is null or pr.min_rent >= v_min) and (v_max is null or pr.min_rent <= v_max)
       and (v_am is null or pr.amenities @> v_am)
       and (v_city is null or lower(pr.city) = v_city)
       and (v_loc is null or lower(pr.locality) = any(v_loc))
       and (v_pin is null or pr.pincode = v_pin)
       and (v_s is null or pr.name ilike '%' || v_s || '%' or pr.address ilike '%' || v_s || '%'
            or pr.locality ilike '%' || v_s || '%' or pr.landmark ilike '%' || v_s || '%' or pr.city ilike '%' || v_s || '%')
  ), pg as (
    select * from f order by grp, feat desc, boost desc, live_at desc, id desc limit v_lim offset v_off
  )
  select (select count(*) from f)::int,
         coalesce(jsonb_agg(public._pub_json(pg.id) order by pg.grp, pg.feat desc, pg.boost desc, pg.live_at desc, pg.id desc), '[]'::jsonb)
    into v_total, v_items
    from pg;
  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

-- location filter list: only places that have a live property THIS site shows, with the count.
-- body (optional): { city, site }   ->   [ { city, locality, count } ]
create or replace function public.api_public_localities(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'locality', x.locality, 'count', x.n)
                            order by x.n desc, x.locality), '[]'::jsonb)
  from (select initcap(lower(pr.city)) as city, initcap(lower(pr.locality)) as locality, count(*)::int as n
          from properties pr
          join users u on u.id = pr.user_id
         where pr.is_live and coalesce(trim(pr.city), '') <> '' and coalesce(trim(pr.locality), '') <> ''
           and public._site_sees(u.partner_id, nullif(lower(trim(coalesce(p->>'site', ''))), ''))
           and (nullif(lower(trim(coalesce(p->>'city', ''))), '') is null or lower(pr.city) = lower(trim(p->>'city')))
         group by 1, 2) x
$$;

-- grants (the earlier public functions keep theirs; repeated to be safe)
grant execute on function public.api_public_listings(jsonb)   to anon, authenticated;
grant execute on function public.api_public_listing(jsonb)    to anon, authenticated;
grant execute on function public.api_public_localities(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- HOW TO USE  (run by hand in the Supabase SQL Editor when you need it)
-- =====================================================================
-- A) new collab company
--      insert into partners (name, slug) values ('RoomWala', 'roomwala');
--      update users set partner_id = (select id from partners where slug = 'roomwala')
--       where phone in ('9876543210', '9123456780');          -- all their owners
--
-- B) one owner with 5 properties who wants his own website: same thing, one phone number
--      insert into partners (name, slug) values ('Sharma Rooms', 'sharma-rooms');
--      update users set partner_id = (select id from partners where slug = 'sharma-rooms')
--       where phone = '9876543210';
--
-- C) let that partner's site ALSO show your own owners (below its own properties)
--      update partners set show_kirayasaathi = true  where slug = 'roomwala';
--    turn it off again
--      update partners set show_kirayasaathi = false where slug = 'roomwala';
--
-- D) a small owner wants a boost (low leads): feature his property for 7 days
--      update properties set featured_until = now() + interval '7 days' where id = 123;
--    stop it
--      update properties set featured_until = null where id = 123;
--
-- E) small permanent push inside the same group (optional)
--      update properties set rank_boost = 5 where id = 123;
--
-- F) take an owner back to plain KirayaSaathi
--      update users set partner_id = null where phone = '9876543210';
--
-- G) website calls (same functions, one more optional key)
--      api_public_listings({})                         -> main site: featured first, then all, newest first
--      api_public_listings({ "site": "roomwala" })     -> roomwala's site: his own, then yours (if C is on)
--      api_public_localities({ "site": "roomwala" })   -> location filter list for that site
-- =====================================================================
