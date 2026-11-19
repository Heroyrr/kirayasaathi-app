-- =====================================================================
-- OWNER APP  |  PART 6: Support (complaints)
-- Run once after part 5. Safe to run again.
-- =====================================================================

-- statuses: pending (default), processing, done, cancel
alter table public.complaints drop constraint if exists complaints_status_check;
update public.complaints set status = case status when 'open' then 'pending' when 'in_progress' then 'processing' when 'resolved' then 'done' else status end;
alter table public.complaints add constraint complaints_status_check check (status in ('pending','processing','done','cancel'));
alter table public.complaints alter column status set default 'pending';
alter table public.complaints add column if not exists tenant_id bigint references public.tenants(id) on delete set null;
alter table public.complaints add column if not exists bed_id    bigint references public.beds(id) on delete set null;
create index if not exists complaints_status_idx on public.complaints(property_id, status, created_at desc);

-- notes added over time on one complaint
create table if not exists public.complaint_notes (
  id            bigint generated always as identity primary key,
  complaint_id  bigint not null references public.complaints(id) on delete cascade,
  text          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists complaint_notes_idx on public.complaint_notes(complaint_id, created_at desc);

-- photos: on the complaint itself (note_id empty) or on one note
create table if not exists public.complaint_files (
  id            bigint generated always as identity primary key,
  complaint_id  bigint not null references public.complaints(id) on delete cascade,
  note_id       bigint references public.complaint_notes(id) on delete cascade,
  file_key      text not null,
  mime_type     text not null default 'image/jpeg',
  created_at    timestamptz not null default now()
);
create index if not exists complaint_files_idx on public.complaint_files(complaint_id);

alter table public.complaint_notes enable row level security;
alter table public.complaint_files enable row level security;
revoke all on public.complaint_notes from anon, authenticated;
revoke all on public.complaint_files from anon, authenticated;

create or replace function public._chk_complaint(cid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from complaints c join properties p on p.id = c.property_id where c.id = cid and p.user_id = uid) then
    perform public._nf();
  end if;
end $$;

create or replace function public._cp_json(cid bigint, with_files boolean default false) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id,
    'kind', case when c.tenant_id is null then 'property' else 'tenant' end,
    'property', jsonb_build_object('id', pr.id, 'name', pr.name, 'type', pr.type),
    'room', case when r.id is null then null else jsonb_build_object('id', r.id, 'room_no', r.room_no) end,
    'bed',  case when bd.id is null then null else jsonb_build_object('id', bd.id, 'label', bd.label) end,
    'tenant', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone, 'photo_key', t.photo_key) end,
    'service', c.service, 'status', c.status, 'created_at', c.created_at,
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

-- list + counts per status (counts follow the month and the property)
create or replace function public.api_get_complaints(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_st text := nullif(p->>'status', ''); v_month text := nullif(p->>'month', '');
  v_pid bigint := public._bid(p->>'property_id'); v_counts jsonb; v_list jsonb;
begin
  select jsonb_build_object(
      'pending',    count(*) filter (where c.status = 'pending'),
      'processing', count(*) filter (where c.status = 'processing'),
      'done',       count(*) filter (where c.status = 'done'),
      'cancel',     count(*) filter (where c.status = 'cancel'),
      'total',      count(*))
    into v_counts
    from complaints c join properties pr on pr.id = c.property_id
   where pr.user_id = v_uid
     and (v_pid is null or c.property_id = v_pid)
     and (v_month is null or to_char(c.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month);
  select coalesce(jsonb_agg(public._cp_json(c.id) order by c.created_at desc, c.id desc), '[]'::jsonb) into v_list
    from complaints c join properties pr on pr.id = c.property_id
   where pr.user_id = v_uid
     and (v_st is null or c.status = v_st)
     and (v_pid is null or c.property_id = v_pid)
     and (v_month is null or to_char(c.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month);
  return jsonb_build_object('counts', v_counts, 'complaints', v_list);
end $$;

create or replace function public.api_get_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id');
begin
  perform public._chk_complaint(v_id, v_uid);
  return public._cp_json(v_id, true);
end $$;

-- a photo list from the app: [{file_key, mime_type}], each key must be in the owner's own folder
create or replace function public._cp_add_files(cid bigint, nid bigint, files jsonb, uid bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare f jsonb; v_auth text; n int := 0;
begin
  if files is null or jsonb_typeof(files) <> 'array' then return; end if;
  select auth_id::text into v_auth from users where id = uid;
  for f in select * from jsonb_array_elements(files) loop
    n := n + 1;
    if n > 6 then exit; end if;
    if coalesce(f->>'file_key', '') = '' or split_part(f->>'file_key', '/', 1) <> v_auth then perform public._nf(); end if;
    insert into complaint_files(complaint_id, note_id, file_key, mime_type)
    values (cid, nid, f->>'file_key', coalesce(nullif(f->>'mime_type', ''), 'image/jpeg'));
  end loop;
end $$;

create or replace function public.api_add_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'property_id'); v_kind text := coalesce(p->>'kind', '');
  v_service text := trim(coalesce(p->>'service', '')); v_note text := nullif(trim(coalesce(p->>'note', '')), '');
  v_prop properties; v_room bigint; v_bed bigint; v_tid bigint; v_cid bigint; v_nid bigint;
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
  values (v_pid, v_room, v_bed, v_tid, v_service, v_note, 'pending') returning id into v_cid;
  if v_note is not null then
    insert into complaint_notes(complaint_id, text) values (v_cid, v_note) returning id into v_nid;
  end if;
  perform public._cp_add_files(v_cid, null, p->'files', v_uid);
  perform public._cp_add_files(v_cid, v_nid, p->'note_files', v_uid);
  return public._cp_json(v_cid, true);
end $$;

-- add a note (with optional photos) and/or change the status
create or replace function public.api_update_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id');
  v_note text := case when p ? 'note' then nullif(trim(coalesce(p->>'note', '')), '') else null end; v_nid bigint;
begin
  perform public._assert_write(v_uid);
  perform public._chk_complaint(v_id, v_uid);
  if p ? 'status' and coalesce(p->>'status', '') not in ('pending','processing','done','cancel') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  if v_note is not null then
    insert into complaint_notes(complaint_id, text) values (v_id, v_note) returning id into v_nid;
  end if;
  perform public._cp_add_files(v_id, v_nid, p->'files', v_uid);
  if p ? 'status' then update complaints set status = p->>'status' where id = v_id; end if;
  return public._cp_json(v_id, true);
end $$;

-- Home: only pending and processing complaints show as reminders
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
                     order by remind_at limit 5) c join properties pr on pr.id = c.property_id), '[]'::jsonb)),
    'subscription', public._sub(v_uid));
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
