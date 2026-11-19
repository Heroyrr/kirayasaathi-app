-- =====================================================================
-- OWNER APP (KirayaSaathi)  |  PART 7: email + password owners, admin helpers, complaint description
-- Run once after part 6. Safe to run again.
-- =====================================================================

-- ---------- owners can log in with email (phone becomes optional) ----------
alter table public.users alter column phone drop not null;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists disabled_at timestamptz;      -- set by the admin to block an owner
create unique index if not exists users_email_unique on public.users (lower(email)) where email is not null;

create or replace function public._user_json(u users) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email, 'language', u.language)
$$;

-- a blocked owner cannot read or write anything
create or replace function public._uid() returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v bigint; v_off timestamptz;
begin
  select id, disabled_at into v, v_off from public.users where auth_id = auth.uid();
  if v is null then perform public._err('UNAUTH', 'Please log in again.', 401); end if;
  if v_off is not null then perform public._err('ACCOUNT_DISABLED', 'Your account is turned off. Please contact support.', 403); end if;
  return v;
end $$;

-- first login after the admin created the owner: makes the owner profile and the free trial
create or replace function public.api_bootstrap(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_auth uuid := auth.uid(); v_u users; v_phone text; v_email text; v_meta jsonb; v_name text := trim(coalesce(p->>'name', ''));
begin
  if v_auth is null then perform public._err('UNAUTH', 'Please log in again.', 401); end if;
  select * into v_u from users where auth_id = v_auth;
  if found then
    if v_u.disabled_at is not null then perform public._err('ACCOUNT_DISABLED', 'Your account is turned off. Please contact support.', 403); end if;
    if v_u.email is null then
      update users set email = (select lower(nullif(email, '')) from auth.users where id = v_auth) where id = v_u.id returning * into v_u;
    end if;
  else
    select nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), ''), lower(nullif(email, '')), raw_user_meta_data
      into v_phone, v_email, v_meta from auth.users where id = v_auth;
    if v_phone is null and v_email like 'owner.test.8299843647@%' then v_phone := '8299843647'; end if;
    if v_name = '' then
      v_name := coalesce(nullif(trim(v_meta->>'full_name'), ''), nullif(trim(v_meta->>'name'), ''),
                         initcap(replace(split_part(coalesce(v_email, ''), '@', 1), '.', ' ')));
    end if;
    if v_name = '' and v_phone = '8299843647' then v_name := 'Test Owner'; end if;
    if length(coalesce(v_name, '')) < 2 then perform public._err('NAME_REQUIRED', 'Please enter your name.'); end if;
    insert into users(auth_id, name, phone, email) values (v_auth, v_name, v_phone, v_email) returning * into v_u;
    insert into subscriptions(user_id, plan, ends_at) values (v_u.id, 'trial', now() + interval '30 days');
  end if;
  return jsonb_build_object('user', public._user_json(v_u), 'subscription', public._sub(v_u.id));
end $$;

-- ---------- ADMIN HELPERS (run in the SQL Editor, or later from your admin panel) ----------
-- Set an owner's plan by email:
--   select admin_set_plan('owner@example.com', 'starter', 'm', 30);     -- plan: trial|basic|starter|growth|pro, cycle: m|y, days
-- Block or unblock an owner:
--   select admin_set_disabled('owner@example.com', true);
create or replace function public.admin_set_plan(p_email text, p_plan text, p_cycle text default 'm', p_days int default 30) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if p_plan not in ('trial','basic','starter','growth','pro') then raise exception 'Unknown plan %', p_plan; end if;
  select id into v_id from users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'No owner with email % (the owner must log in once first)', p_email; end if;
  insert into subscriptions(user_id, plan, cycle, ends_at)
  values (v_id, p_plan, case when p_plan = 'trial' then null else p_cycle end, now() + make_interval(days => p_days))
  on conflict (user_id) do update set plan = excluded.plan, cycle = excluded.cycle, ends_at = excluded.ends_at;
  return format('%s is now on %s until %s', p_email, p_plan, to_char(now() + make_interval(days => p_days), 'DD Mon YYYY'));
end $$;

create or replace function public.admin_set_disabled(p_email text, p_off boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update users set disabled_at = case when p_off then now() else null end where lower(email) = lower(trim(p_email));
  if not found then raise exception 'No owner with email %', p_email; end if;
  return case when p_off then 'blocked' else 'unblocked' end;
end $$;
revoke all on function public.admin_set_plan(text, text, text, int) from public, anon, authenticated;
revoke all on function public.admin_set_disabled(text, boolean) from public, anon, authenticated;

-- ---------- complaints: title + description (+ photos of the description) ----------
create or replace function public._cp_json(cid bigint, with_files boolean default false) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id,
    'kind', case when c.tenant_id is null then 'property' else 'tenant' end,
    'property', jsonb_build_object('id', pr.id, 'name', pr.name, 'type', pr.type),
    'room', case when r.id is null then null else jsonb_build_object('id', r.id, 'room_no', r.room_no) end,
    'bed',  case when bd.id is null then null else jsonb_build_object('id', bd.id, 'label', bd.label) end,
    'tenant', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone, 'photo_key', t.photo_key) end,
    'service', c.service, 'description', c.description, 'status', c.status, 'created_at', c.created_at,
    'files_count', (select count(*) from complaint_files f where f.complaint_id = c.id),
    'last_note', (select n.text from complaint_notes n where n.complaint_id = c.id order by n.created_at desc, n.id desc limit 1))
  || case when with_files then jsonb_build_object(
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_key', f.file_key, 'mime_type', f.mime_type) order by f.id)
                         from complaint_files f where f.complaint_id = c.id and f.note_id is null), '[]'::jsonb),
      'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'text', n.text, 'created_at', n.created_at,
                  'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_key', f.file_key, 'mime_type', f.mime_type) order by f.id)
                                     from complaint_files f where f.note_id = n.id), '[]'::jsonb))
                  order by n.created_at desc, n.id desc) from complaint_notes n where n.complaint_id = c.id), '[]'::jsonb))
    else '{}'::jsonb end
  from complaints c
  join properties pr on pr.id = c.property_id
  left join rooms r on r.id = c.room_id
  left join beds bd on bd.id = c.bed_id
  left join tenants t on t.id = c.tenant_id
  where c.id = cid
$$;

create or replace function public.api_add_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'property_id'); v_kind text := coalesce(p->>'kind', '');
  v_service text := trim(coalesce(p->>'service', ''));                                             -- the complaint title
  v_desc text := nullif(trim(coalesce(p->>'description', p->>'note', '')), '');                    -- the complaint description
  v_prop properties; v_room bigint; v_bed bigint; v_tid bigint; v_cid bigint;
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  if v_service = '' or v_kind not in ('tenant','property') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  select * into v_prop from properties where id = v_pid;
  if v_kind = 'tenant' then
    v_room := public._bid(p->>'room_id');
    if v_room is null or not exists (select 1 from rooms where id = v_room and property_id = v_pid and archived_at is null) then
      perform public._err('E_VALIDATION', 'Select a room.');
    end if;
    if v_prop.type = 'BED' then
      v_bed := public._bid(p->>'bed_id');
      if v_bed is null or not exists (select 1 from beds where id = v_bed and room_id = v_room and archived_at is null) then
        perform public._err('E_VALIDATION', 'Select a bed.');
      end if;
    end if;
    select b.tenant_id into v_tid from bookings b
     where b.room_id = v_room and (v_bed is null or b.bed_id = v_bed) and b.status <> 'moved_out' order by b.id limit 1;
    if v_tid is null then perform public._err('COMPLAINT_NO_TENANT', 'No tenant is staying in this room or bed.'); end if;
  end if;
  insert into complaints(property_id, room_id, bed_id, tenant_id, service, description, status)
  values (v_pid, v_room, v_bed, v_tid, v_service, v_desc, 'pending') returning id into v_cid;
  perform public._cp_add_files(v_cid, null, p->'files', v_uid);       -- photos of the description
  return public._cp_json(v_cid, true);
end $$;

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
