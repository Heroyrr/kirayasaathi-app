-- =====================================================================
-- OWNER APP  |  Supabase schema  |  PART 1 of 3: tables, indexes, security
-- Run the 3 parts in order in: Supabase Dashboard -> SQL Editor.
-- Safe to run again (uses IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

-- ---------- owners ----------
create table if not exists public.users (
  id               bigint generated always as identity primary key,
  auth_id          uuid not null unique references auth.users(id) on delete cascade,
  name             text not null,
  phone            text not null unique,          -- 10 digits, no +91
  language         text not null default 'en' check (language in ('en','hi')),
  invoice_counter  integer not null default 0,
  created_at       timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id          bigint generated always as identity primary key,
  user_id     bigint not null unique references public.users(id) on delete cascade,
  plan        text not null check (plan in ('trial','basic','starter','growth','pro')),
  cycle       text check (cycle in ('m','y')),
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ---------- properties, categories, rooms, beds ----------
create table if not exists public.properties (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('BED','NON_BED')),
  address     text,
  created_at  timestamptz not null default now()
);
create index if not exists properties_user_idx on public.properties(user_id);

create table if not exists public.categories (
  id             bigint generated always as identity primary key,
  property_id    bigint not null references public.properties(id) on delete cascade,
  name           text not null,
  rent           numeric(12,2) not null check (rent >= 0),
  beds_per_room  integer check (beds_per_room is null or beds_per_room between 1 and 20),
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists categories_property_idx on public.categories(property_id);

create table if not exists public.rooms (
  id           bigint generated always as identity primary key,
  property_id  bigint not null references public.properties(id) on delete cascade,
  category_id  bigint not null references public.categories(id) on delete cascade,
  room_no      text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists rooms_category_idx on public.rooms(category_id);
create unique index if not exists rooms_unique_no on public.rooms(property_id, lower(room_no)) where archived_at is null;

create table if not exists public.beds (
  id           bigint generated always as identity primary key,
  room_id      bigint not null references public.rooms(id) on delete cascade,
  label        text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists beds_room_idx on public.beds(room_id);
create unique index if not exists beds_unique_label on public.beds(room_id, label) where archived_at is null;

-- ---------- people and their stays (booking-wise ledger) ----------
create table if not exists public.tenants (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,
  name        text not null,
  phone       text,
  photo_key   text,
  created_at  timestamptz not null default now()
);
create index if not exists tenants_user_idx on public.tenants(user_id);

create table if not exists public.tenant_documents (
  id          bigint generated always as identity primary key,
  tenant_id   bigint not null references public.tenants(id) on delete cascade,
  kind        text not null check (kind in ('aadhaar_front','aadhaar_back','other_id')),
  file_key    text not null,
  mime_type   text not null default 'image/jpeg',
  created_at  timestamptz not null default now()
);
create index if not exists tenant_docs_idx on public.tenant_documents(tenant_id);

create table if not exists public.bookings (
  id                  bigint generated always as identity primary key,
  tenant_id           bigint not null references public.tenants(id) on delete cascade,
  property_id         bigint not null references public.properties(id) on delete cascade,
  room_id             bigint not null references public.rooms(id) on delete cascade,
  bed_id              bigint references public.beds(id) on delete cascade,
  start_date          date not null,
  end_date            date,
  status              text not null default 'active' check (status in ('reserved','active','notice','moved_out')),
  notice_date         date,
  leave_date          date,
  out_date            date,
  deposit             numeric(12,2) not null default 0,
  advance             numeric(12,2) not null default 0,
  written_off         numeric(12,2) not null default 0,
  settle_mode         text check (settle_mode in ('collected','refunded','written_off','pending')),
  agreement_file_key  text,
  created_at          timestamptz not null default now()
);
create index if not exists bookings_tenant_idx   on public.bookings(tenant_id);
create index if not exists bookings_property_idx on public.bookings(property_id, status);
create index if not exists bookings_room_idx     on public.bookings(room_id);
-- one live stay per bed, and one live stay per room when the property has no beds
create unique index if not exists bookings_live_bed  on public.bookings(bed_id)  where status <> 'moved_out' and bed_id is not null;
create unique index if not exists bookings_live_room on public.bookings(room_id) where status <> 'moved_out' and bed_id is null;

-- ---------- meters, invoices, payments ----------
create table if not exists public.meter_readings (
  id          bigint generated always as identity primary key,
  room_id     bigint not null references public.rooms(id) on delete cascade,
  value       numeric(12,2) not null check (value >= 0),
  is_reset    boolean not null default false,
  photo_key   text,
  created_by  bigint references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists readings_room_idx on public.meter_readings(room_id, created_at desc, id desc);

create table if not exists public.invoices (
  id             bigint generated always as identity primary key,
  booking_id     bigint not null references public.bookings(id) on delete cascade,
  number         text not null,
  period_start   date not null,
  period_end     date not null,
  rent           numeric(12,2) not null default 0,
  start_reading  numeric(12,2),
  end_reading    numeric(12,2),
  rate           numeric(12,2),
  split_count    integer not null default 1 check (split_count >= 1),
  electricity    numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  paid           numeric(12,2) not null default 0,
  cancelled      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists invoices_booking_idx on public.invoices(booking_id);

create table if not exists public.invoice_items (
  id          bigint generated always as identity primary key,
  invoice_id  bigint not null references public.invoices(id) on delete cascade,
  name        text not null,
  amount      numeric(12,2) not null
);
create index if not exists invoice_items_idx on public.invoice_items(invoice_id);

create table if not exists public.payments (
  id          bigint generated always as identity primary key,
  booking_id  bigint not null references public.bookings(id) on delete cascade,
  mode        text not null check (mode in ('cash','upi','bank')),
  amount      numeric(12,2) not null check (amount > 0),
  ref_no      text,
  paid_on     date not null,
  created_at  timestamptz not null default now()
);
create index if not exists payments_booking_idx on public.payments(booking_id);
create index if not exists payments_paid_on_idx on public.payments(paid_on);

-- ---------- complaints and leads (Home shows their reminders) ----------
create table if not exists public.complaints (
  id           bigint generated always as identity primary key,
  property_id  bigint not null references public.properties(id) on delete cascade,
  room_id      bigint references public.rooms(id) on delete set null,
  service      text not null,
  description  text,
  status       text not null default 'open' check (status in ('open','in_progress','resolved')),
  remark       text,
  remind_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists complaints_property_idx on public.complaints(property_id);

create table if not exists public.leads (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references public.users(id) on delete cascade,
  name            text not null,
  phone           text,
  message         text,
  status          text not null default 'pending' check (status in ('pending','processing','done','cancel')),
  note            text,
  next_action     text,
  next_action_at  timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists leads_user_idx on public.leads(user_id);

-- ---------- security ----------
-- The app never reads or writes tables directly. It only calls the api_* functions in PART 2,
-- which always check who the owner is. So every table is locked for the public keys.
alter table public.users            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.properties       enable row level security;
alter table public.categories       enable row level security;
alter table public.rooms            enable row level security;
alter table public.beds             enable row level security;
alter table public.tenants          enable row level security;
alter table public.tenant_documents enable row level security;
alter table public.bookings         enable row level security;
alter table public.meter_readings   enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.payments         enable row level security;
alter table public.complaints       enable row level security;
alter table public.leads            enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- private file storage (Aadhaar, agreements, meter photos) ----------
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists "owner reads own files"   on storage.objects;
drop policy if exists "owner uploads own files" on storage.objects;
drop policy if exists "owner updates own files" on storage.objects;
drop policy if exists "owner deletes own files" on storage.objects;

create policy "owner reads own files"   on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner uploads own files" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own files" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes own files" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
-- =====================================================================
-- OWNER APP  |  PART 2 of 3: helper functions (balance, limits, JSON shapes)
-- =====================================================================

-- ---- errors: the app reads the CODE (detail) to show a translated message ----
create or replace function public._err(code text, msg text, http int default 422)
returns void language plpgsql as $$
begin
  raise exception '%', msg using errcode = 'P0001', detail = code, hint = http::text;
end $$;

-- ---- safe casts ----
create or replace function public._bid(v text) returns bigint language plpgsql immutable as $$
begin return nullif(trim(v),'')::bigint; exception when others then return null; end $$;
create or replace function public._num(v text) returns numeric language plpgsql immutable as $$
begin return nullif(trim(v),'')::numeric; exception when others then return null; end $$;
create or replace function public._date(v text) returns date language plpgsql immutable as $$
begin return nullif(trim(v),'')::date; exception when others then return null; end $$;

-- ---- who is calling ----
create or replace function public._uid() returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v bigint;
begin
  select id into v from public.users where auth_id = auth.uid();
  if v is null then perform public._err('UNAUTH', 'Please log in again.', 401); end if;
  return v;
end $$;

-- ---- plan limits ----
create or replace function public._limits(plan text, out unit_limit int, out property_limit int)
language sql immutable as $$
  select case plan when 'trial' then 10 when 'basic' then 10 when 'starter' then 25
                   when 'growth' then 60 when 'pro' then 150 else 0 end,
         case plan when 'trial' then 1 when 'basic' then 1 when 'starter' then 2
                   when 'growth' then 5 else null end
$$;

create or replace function public._prop_units(pid bigint) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when (select type from properties where id = pid) = 'BED'
    then (select count(*) from beds b join rooms r on r.id = b.room_id
          where r.property_id = pid and r.archived_at is null and b.archived_at is null)
    else (select count(*) from rooms r where r.property_id = pid and r.archived_at is null)
  end::int
$$;

create or replace function public._used_units(uid bigint) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(public._prop_units(p.id)), 0)::int from properties p where p.user_id = uid
$$;

-- ---- subscription state (30-day trial, 7-day grace, then view-only) ----
create or replace function public._sub(uid bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s subscriptions; lim record; st text; dl int; grace timestamptz;
begin
  select * into s from subscriptions where user_id = uid;
  if not found then
    return jsonb_build_object('plan', null, 'state', 'view_only', 'can_write', false,
      'used_units', public._used_units(uid),
      'used_properties', (select count(*) from properties where user_id = uid));
  end if;
  select * into lim from public._limits(s.plan);
  grace := s.ends_at + interval '7 days';
  st := case when now() <= s.ends_at then 'active' when now() <= grace then 'grace' else 'view_only' end;
  dl := greatest(0, ceil(extract(epoch from (s.ends_at - now())) / 86400))::int;
  return jsonb_build_object(
    'plan', s.plan, 'cycle', s.cycle, 'ends_at', s.ends_at, 'grace_ends_at', grace,
    'days_left', dl, 'state', st, 'can_write', st <> 'view_only',
    'unit_limit', lim.unit_limit, 'property_limit', lim.property_limit,
    'used_units', public._used_units(uid),
    'used_properties', (select count(*) from properties where user_id = uid));
end $$;

create or replace function public._assert_write(uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce((public._sub(uid)->>'can_write')::boolean, false) then
    perform public._err('VIEW_ONLY', 'Your plan has ended. Choose a plan to make changes.', 403);
  end if;
end $$;

create or replace function public._check_units(uid bigint, add_units int) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_limit int; v_used int;
begin
  v_limit := (public._sub(uid)->>'unit_limit')::int;
  v_used  := public._used_units(uid);
  if v_used + add_units > v_limit then
    perform public._err('UNIT_LIMIT',
      format('Your plan allows %s units and you have %s. Upgrade your plan to add more.', v_limit, v_used), 403);
  end if;
end $$;

-- ---- ownership checks (raise "not found" for anything that is not the caller's) ----
create or replace function public._nf() returns void language plpgsql as $$
begin perform public._err('E_NOT_FOUND', 'Not found. It may have been removed.', 404); end $$;

create or replace function public._chk_property(pid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from properties where id = pid and user_id = uid) then perform public._nf(); end if; end $$;

create or replace function public._chk_category(cid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from categories c join properties p on p.id = c.property_id
  where c.id = cid and p.user_id = uid and c.archived_at is null) then perform public._nf(); end if; end $$;

create or replace function public._chk_room(rid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from rooms r join properties p on p.id = r.property_id
  where r.id = rid and p.user_id = uid and r.archived_at is null) then perform public._nf(); end if; end $$;

create or replace function public._chk_bed(bid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from beds b join rooms r on r.id = b.room_id join properties p on p.id = r.property_id
  where b.id = bid and p.user_id = uid and b.archived_at is null) then perform public._nf(); end if; end $$;

create or replace function public._chk_tenant(tid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from tenants where id = tid and user_id = uid) then perform public._nf(); end if; end $$;

create or replace function public._chk_booking(bid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from bookings b join properties p on p.id = b.property_id
  where b.id = bid and p.user_id = uid) then perform public._nf(); end if; end $$;

create or replace function public._chk_invoice(iid bigint, uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not exists (select 1 from invoices i join bookings b on b.id = i.booking_id
  join properties p on p.id = b.property_id where i.id = iid and p.user_id = uid) then perform public._nf(); end if; end $$;

-- ---- balance: ALWAYS calculated, never stored ----
-- balance = sum(total - paid) of non-cancelled invoices - advance - written_off
-- positive = tenant owes the owner, negative = owner holds the tenant's advance
create or replace function public._bk_summary(bid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'invoiced',    coalesce(sum(i.total) filter (where not i.cancelled), 0),
    'paid',        coalesce(sum(i.paid)  filter (where not i.cancelled), 0),
    'advance',     b.advance,
    'written_off', b.written_off,
    'balance',     coalesce(sum(i.total - i.paid) filter (where not i.cancelled), 0) - b.advance - b.written_off)
  from bookings b left join invoices i on i.booking_id = b.id
  where b.id = bid group by b.id
$$;

create or replace function public._bk_balance(bid bigint) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((public._bk_summary(bid)->>'balance')::numeric, 0)
$$;

-- ---- JSON shapes the app already expects ----
create or replace function public._bk_ref(bid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', b.id,
    'tenant',   jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone),
    'room',     jsonb_build_object('id', r.id, 'room_no', r.room_no),
    'bed',      case when bd.id is null then null else jsonb_build_object('id', bd.id, 'label', bd.label) end,
    'property', jsonb_build_object('id', p.id, 'name', p.name))
  from bookings b join tenants t on t.id = b.tenant_id join rooms r on r.id = b.room_id
  join properties p on p.id = b.property_id left join beds bd on bd.id = b.bed_id
  where b.id = bid
$$;

create or replace function public._bk_json(bid bigint, detail boolean default false) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id, 'tenant_id', b.tenant_id, 'property_id', b.property_id, 'room_id', b.room_id, 'bed_id', b.bed_id,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'notice_date', b.notice_date, 'leave_date', b.leave_date, 'out_date', b.out_date,
    'deposit', b.deposit, 'advance', b.advance, 'written_off', b.written_off,
    'settle_mode', b.settle_mode, 'agreement_file_key', b.agreement_file_key,
    'balance', public._bk_balance(b.id),
    'tenant',   jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone),
    'property', jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type),
    'room',     jsonb_build_object('id', r.id, 'room_no', r.room_no),
    'bed',      case when bd.id is null then null else jsonb_build_object('id', bd.id, 'label', bd.label) end)
  || case when detail then jsonb_build_object('summary', public._bk_summary(b.id)) else '{}'::jsonb end
  from bookings b join tenants t on t.id = b.tenant_id join rooms r on r.id = b.room_id
  join properties p on p.id = b.property_id left join beds bd on bd.id = b.bed_id
  where b.id = bid
$$;

create or replace function public._inv_json(iid bigint, with_items boolean default false) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', i.id, 'booking_id', i.booking_id, 'number', i.number,
    'period_start', i.period_start, 'period_end', i.period_end, 'rent', i.rent,
    'start_reading', i.start_reading, 'end_reading', i.end_reading, 'rate', i.rate,
    'split_count', i.split_count, 'electricity', i.electricity, 'total', i.total, 'paid', i.paid,
    'cancelled', i.cancelled, 'created_at', i.created_at, 'booking', public._bk_ref(i.booking_id))
  || case when with_items then jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'invoice_id', x.invoice_id,
                 'name', x.name, 'amount', x.amount) order by x.id) from invoice_items x where x.invoice_id = i.id), '[]'::jsonb),
      'due', case when i.cancelled then 0 else greatest(i.total - i.paid, 0) end,
      'balance', public._bk_balance(i.booking_id),
      'previous_balance', public._bk_balance(i.booking_id) - case when i.cancelled then 0 else (i.total - i.paid) end)
    else '{}'::jsonb end
  from invoices i where i.id = iid
$$;

create or replace function public._prop_row(pid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'address', p.address,
    'units', u.units, 'occupied', u.occ, 'vacant', greatest(u.units - u.occ, 0))
  from properties p
  cross join lateral (select public._prop_units(p.id) as units,
    (select count(*) from bookings b where b.property_id = p.id and b.status <> 'moved_out')::int as occ) u
  where p.id = pid
$$;

create or replace function public._rd_json(rid bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', m.id, 'room_id', m.room_id, 'value', m.value, 'is_reset', m.is_reset,
    'photo_key', m.photo_key, 'created_at', m.created_at) from meter_readings m where m.id = rid
$$;

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
                  'balance', public._bk_balance(b.id), 'agreement_done', b.agreement_file_key is not null) order by b.id)
                  from bookings b join properties p on p.id = b.property_id join rooms r on r.id = b.room_id
                  left join beds bd on bd.id = b.bed_id
                  where b.tenant_id = t.id and b.status <> 'moved_out'), '[]'::jsonb),
    'bookings_count', (select count(*) from bookings b where b.tenant_id = t.id),
    'total_balance', coalesce((select sum(public._bk_balance(b.id)) from bookings b where b.tenant_id = t.id), 0))
  from tenants t where t.id = tid
$$;

-- ---- room number list: "101, 102, 201-204" -> {101,102,201,202,203,204} ----
create or replace function public._parse_rooms(s text) returns text[]
language plpgsql immutable as $$
declare v_tok text; v_out text[] := '{}'; v_a text; v_b text; v_i bigint; v_x text;
begin
  if s is null then return v_out; end if;
  s := regexp_replace(s, '\s*-\s*', '-', 'g');
  foreach v_tok in array regexp_split_to_array(trim(s), '[,;\s]+') loop
    if v_tok = '' then continue; end if;
    if v_tok ~ '^\d+-\d+$' then
      v_a := split_part(v_tok, '-', 1); v_b := split_part(v_tok, '-', 2);
      if v_b::bigint < v_a::bigint or v_b::bigint - v_a::bigint > 500 then
        perform public._err('E_VALIDATION', 'Check the room number range.');
      end if;
      for v_i in v_a::bigint .. v_b::bigint loop
        v_x := case when left(v_a, 1) = '0' then lpad(v_i::text, length(v_a), '0') else v_i::text end;
        if not (v_x = any (v_out)) then v_out := v_out || v_x; end if;
      end loop;
    else
      if not (v_tok = any (v_out)) then v_out := v_out || v_tok; end if;
    end if;
  end loop;
  return v_out;
end $$;

-- ---- meter reading rules (append-only, never lower unless reset) ----
create or replace function public._save_reading(uid bigint, rid bigint, val numeric, is_reset boolean,
                                                photo text default null, strict_mode boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_last meter_readings; v_id bigint;
begin
  select * into v_last from meter_readings where room_id = rid order by created_at desc, id desc limit 1;
  if found and not is_reset then
    if val = v_last.value and photo is null then return public._rd_json(v_last.id); end if;
    if val < v_last.value then
      if strict_mode then
        perform public._err('READING_LOWER',
          format('The reading cannot be lower than the last one (%s). Switch on "Meter was replaced or reset" if it was reset.', trim_scale(v_last.value)));
      else
        return null;  -- editing an old invoice: keep the number on the invoice, do not add a lower reading
      end if;
    end if;
  end if;
  insert into meter_readings(room_id, value, is_reset, photo_key, created_by)
  values (rid, val, coalesce(is_reset, false), photo, uid) returning id into v_id;
  return public._rd_json(v_id);
end $$;

-- ---- money moves ----
create or replace function public._record_payment(bid bigint, pmode text, amt numeric, ref text, d date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pid bigint; v_left numeric := amt; v_applied jsonb := '[]'::jsonb; r record; v_a numeric;
begin
  insert into payments(booking_id, mode, amount, ref_no, paid_on)
  values (bid, pmode, amt, nullif(trim(ref), ''), d) returning id into v_pid;
  -- oldest unpaid invoice first
  for r in select id, total, paid from invoices
           where booking_id = bid and not cancelled and paid < total order by period_start, id loop
    exit when v_left <= 0;
    v_a := least(v_left, r.total - r.paid);
    update invoices set paid = paid + v_a where id = r.id;
    v_applied := v_applied || jsonb_build_array(jsonb_build_object('invoice_id', r.id, 'amount', v_a));
    v_left := v_left - v_a;
  end loop;
  -- anything extra becomes advance
  if v_left > 0 then update bookings set advance = advance + v_left where id = bid; end if;
  return jsonb_build_object('payment_id', v_pid, 'applied', v_applied, 'to_advance', v_left);
end $$;

create or replace function public._apply_advance(bid bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_adv numeric; r record; v_a numeric;
begin
  select advance into v_adv from bookings where id = bid for update;
  for r in select id, total, paid from invoices
           where booking_id = bid and not cancelled and paid < total order by period_start, id loop
    exit when v_adv <= 0;
    v_a := least(v_adv, r.total - r.paid);
    update invoices set paid = paid + v_a where id = r.id;
    v_adv := v_adv - v_a;
  end loop;
  update bookings set advance = v_adv where id = bid;
end $$;

-- move out / room change: settle the balance, then close the stay
create or replace function public._settle_close(bid bigint, outd date, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_bal numeric; v_mode text := nullif(p->>'settle_mode', ''); v_pm text;
begin
  perform public._apply_advance(bid);
  v_bal := public._bk_balance(bid);
  if v_bal > 0 then
    if v_mode = 'collected' then
      v_pm := p->>'payment_mode';
      if v_pm not in ('cash','upi','bank') or coalesce(trim(p->>'ref_no'), '') = '' then
        perform public._err('E_VALIDATION', 'Choose the payment mode and enter the reference number.');
      end if;
      perform public._record_payment(bid, v_pm, v_bal, p->>'ref_no', outd);
    elsif v_mode = 'written_off' then
      update bookings set written_off = written_off + v_bal where id = bid;
    else
      v_mode := 'pending';          -- the due stays on this old booking only
    end if;
  elsif v_bal < 0 then
    if v_mode = 'refunded' then
      update bookings set advance = 0 where id = bid;
    else
      v_mode := 'pending';
    end if;
  else
    v_mode := null;
  end if;
  update bookings set status = 'moved_out', out_date = outd, settle_mode = v_mode where id = bid;
end $$;

-- create a stay after checking the room or bed is free
create or replace function public._new_booking(uid bigint, tid bigint, rid bigint, bedid bigint,
  sd date, ed date, st text, dep numeric, adv numeric) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prop properties; v_room rooms; v_id bigint;
begin
  perform public._chk_tenant(tid, uid);
  select * into v_room from rooms where id = rid;
  if not found then perform public._nf(); end if;
  if v_room.archived_at is not null then perform public._err('ROOM_ARCHIVED', 'This room was removed.'); end if;
  perform public._chk_room(rid, uid);
  select * into v_prop from properties where id = v_room.property_id;
  if v_prop.type = 'BED' then
    if bedid is null then perform public._err('BED_REQUIRED', 'Choose a bed.'); end if;
    if not exists (select 1 from beds where id = bedid and room_id = rid and archived_at is null) then
      perform public._err('BED_INVALID', 'That bed does not belong to this room.');
    end if;
    if exists (select 1 from bookings where bed_id = bedid and status <> 'moved_out') then
      perform public._err('SLOT_TAKEN', 'This bed or room is already booked.');
    end if;
  else
    bedid := null;
    if exists (select 1 from bookings where room_id = rid and status <> 'moved_out') then
      perform public._err('SLOT_TAKEN', 'This bed or room is already booked.');
    end if;
  end if;
  insert into bookings(tenant_id, property_id, room_id, bed_id, start_date, end_date, status, deposit, advance)
  values (tid, v_room.property_id, rid, bedid, sd, ed, st, coalesce(dep, 0), coalesce(adv, 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public._next_inv_number(uid bigint) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update users set invoice_counter = invoice_counter + 1 where id = uid returning invoice_counter into n;
  return 'INV-' || to_char(now(), 'YY') || '-' || lpad(n::text, 4, '0');
end $$;

-- electricity = round((end - start) x rate / people sharing), never below 0
create or replace function public._electricity(sr numeric, er numeric, rate numeric, split int) returns numeric
language sql immutable as $$
  select case when sr is null or er is null or rate is null then 0
              else greatest(0, round((er - sr) * rate / greatest(split, 1))) end
$$;
-- =====================================================================
-- OWNER APP  |  PART 3 of 3: the api_* functions the app calls
-- Every function takes ONE json argument "p" and returns json.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LOGIN
-- ---------------------------------------------------------------------
-- TEST NUMBER: 8299843647 always counts as an existing owner, so no name is asked.
-- (Its OTP 123456 is set in the Supabase dashboard, see the setup steps.)
create or replace function public.api_phone_status(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_phone text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
begin
  v_phone := right(v_phone, 10);
  return jsonb_build_object('exists', v_phone = '8299843647' or exists (select 1 from users where phone = v_phone));
end $$;

create or replace function public._user_json(u users) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'language', u.language)
$$;

-- called right after the OTP is verified: creates the owner + 30-day trial the first time
create or replace function public.api_bootstrap(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_auth uuid := auth.uid(); v_u users; v_phone text; v_name text := trim(coalesce(p->>'name', ''));
begin
  if v_auth is null then perform public._err('UNAUTH', 'Please log in again.', 401); end if;
  select * into v_u from users where auth_id = v_auth;
  if not found then
    select right(regexp_replace(coalesce(nullif(phone, ''),
             case when email like 'owner.test.8299843647@%' then '8299843647' else '' end), '\D', '', 'g'), 10)
      into v_phone from auth.users where id = v_auth;
    if v_phone is null or v_phone = '' then perform public._err('E_VALIDATION', 'Phone number missing.'); end if;
    if v_name = '' and v_phone = '8299843647' then v_name := 'Test Owner'; end if;
    if length(v_name) < 2 then perform public._err('NAME_REQUIRED', 'Please enter your name.'); end if;
    insert into users(auth_id, name, phone) values (v_auth, v_name, v_phone) returning * into v_u;
    insert into subscriptions(user_id, plan, ends_at) values (v_u.id, 'trial', now() + interval '30 days');
  end if;
  return jsonb_build_object('user', public._user_json(v_u), 'subscription', public._sub(v_u.id));
end $$;

create or replace function public.api_me(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_u users;
begin
  if p ? 'language' and p->>'language' in ('en','hi') then
    update users set language = p->>'language' where id = v_uid;
  end if;
  select * into v_u from users where id = v_uid;
  return jsonb_build_object('user', public._user_json(v_u), 'subscription', public._sub(v_uid));
end $$;

-- ---------------------------------------------------------------------
-- HOME
-- ---------------------------------------------------------------------
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
               from (select * from complaints where status <> 'resolved' and remind_at is not null
                     and property_id in (select id from properties where user_id = v_uid)
                     order by remind_at limit 5) c join properties pr on pr.id = c.property_id), '[]'::jsonb)),
    'subscription', public._sub(v_uid));
end $$;

-- ---------------------------------------------------------------------
-- PROPERTIES
-- ---------------------------------------------------------------------
create or replace function public.api_get_properties(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  return coalesce((select jsonb_agg(public._prop_row(id) order by id) from properties where user_id = v_uid), '[]'::jsonb);
end $$;

create or replace function public.api_get_property(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
begin
  perform public._chk_property(v_pid, v_uid);
  return public._prop_row(v_pid) || jsonb_build_object('categories', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'rent', c.rent, 'beds_per_room', c.beds_per_room,
      'rooms', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'room_no', r.room_no,
          'occupied', exists (select 1 from bookings b where b.room_id = r.id and b.status <> 'moved_out'),
          'bookings', coalesce((select jsonb_agg(jsonb_build_object('booking_id', b.id, 'status', b.status,
                'tenant_id', b.tenant_id, 'tenant_name', t.name) order by b.id)
                from bookings b join tenants t on t.id = b.tenant_id
                where b.room_id = r.id and b.status <> 'moved_out'), '[]'::jsonb),
          'beds', coalesce((select jsonb_agg(jsonb_build_object('id', bd.id, 'label', bd.label,
                'occupied', exists (select 1 from bookings b where b.bed_id = bd.id and b.status <> 'moved_out'),
                'booking', (select jsonb_build_object('booking_id', b.id, 'status', b.status,
                              'tenant_id', b.tenant_id, 'tenant_name', t.name)
                            from bookings b join tenants t on t.id = b.tenant_id
                            where b.bed_id = bd.id and b.status <> 'moved_out' limit 1)) order by bd.label)
                from beds bd where bd.room_id = r.id and bd.archived_at is null), '[]'::jsonb))
          order by lpad(regexp_replace(r.room_no, '\D', '', 'g'), 12, '0'), r.room_no)
        from rooms r where r.category_id = c.id and r.archived_at is null), '[]'::jsonb)) order by c.id)
    from categories c where c.property_id = v_pid and c.archived_at is null), '[]'::jsonb));
end $$;

create or replace function public.api_add_property(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint; v_lim int;
begin
  perform public._assert_write(v_uid);
  if coalesce(trim(p->>'name'), '') = '' or coalesce(p->>'type', '') not in ('BED','NON_BED') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  v_lim := (public._sub(v_uid)->>'property_limit')::int;
  if v_lim is not null and (select count(*) from properties where user_id = v_uid) >= v_lim then
    perform public._err('PROPERTY_LIMIT', 'Your plan allows only ' || v_lim || ' properties. Upgrade to add more.', 403);
  end if;
  insert into properties(user_id, name, type, address)
  values (v_uid, trim(p->>'name'), p->>'type', nullif(trim(coalesce(p->>'address', '')), '')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_update_property(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  if p ? 'name' and trim(coalesce(p->>'name', '')) = '' then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  update properties set
    name    = case when p ? 'name' then trim(p->>'name') else name end,
    address = case when p ? 'address' then nullif(trim(coalesce(p->>'address', '')), '') else address end
  where id = v_pid;
  return jsonb_build_object('id', v_pid);
end $$;

-- hard delete: also removes the property's rooms, bookings, invoices and payments
create or replace function public.api_delete_property(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  if coalesce(p->>'confirm', '') <> 'true' then perform public._err('E_VALIDATION', 'Please confirm the delete.'); end if;
  delete from properties where id = v_pid;
  return jsonb_build_object('deleted', true);
end $$;

-- ---------------------------------------------------------------------
-- CATEGORIES, ROOMS, BEDS
-- ---------------------------------------------------------------------
create or replace function public.api_add_category(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id'); v_prop properties;
  v_rent numeric := public._num(p->>'rent'); v_rooms text[]; v_bpr int; v_cid bigint; v_rid bigint; v_no text;
  v_dup text; v_i int;
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  select * into v_prop from properties where id = v_pid;
  if coalesce(trim(p->>'name'), '') = '' or v_rent is null or v_rent < 0 then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  v_rooms := public._parse_rooms(p->>'rooms');
  if array_length(v_rooms, 1) is null then perform public._err('E_VALIDATION', 'Enter at least one room number.'); end if;
  if v_prop.type = 'BED' then
    v_bpr := public._bid(p->>'beds_per_room')::int;
    if v_bpr is null or v_bpr < 1 or v_bpr > 20 then perform public._err('E_VALIDATION', 'Beds per room must be between 1 and 20.'); end if;
  else
    v_bpr := null;
  end if;
  select string_agg(r.room_no, ', ') into v_dup from rooms r
   where r.property_id = v_pid and r.archived_at is null and lower(r.room_no) in (select lower(x) from unnest(v_rooms) x);
  if v_dup is not null then perform public._err('ROOM_EXISTS', 'Room ' || v_dup || ' already exists in this property.'); end if;
  perform public._check_units(v_uid, array_length(v_rooms, 1) * coalesce(v_bpr, 1));

  insert into categories(property_id, name, rent, beds_per_room)
  values (v_pid, trim(p->>'name'), v_rent, v_bpr) returning id into v_cid;
  foreach v_no in array v_rooms loop
    insert into rooms(property_id, category_id, room_no) values (v_pid, v_cid, v_no) returning id into v_rid;
    if v_prop.type = 'BED' then
      for v_i in 1 .. v_bpr loop
        insert into beds(room_id, label) values (v_rid, chr(64 + v_i));
      end loop;
    end if;
  end loop;
  return jsonb_build_object('category', jsonb_build_object('id', v_cid), 'rooms_added', array_length(v_rooms, 1));
end $$;

create or replace function public.api_update_category(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_cid bigint := public._bid(p->>'id'); v_rent numeric := public._num(p->>'rent');
begin
  perform public._assert_write(v_uid);
  perform public._chk_category(v_cid, v_uid);
  if (p ? 'name' and trim(coalesce(p->>'name', '')) = '') or (p ? 'rent' and (v_rent is null or v_rent < 0)) then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  -- a new rent applies to new invoices only; old invoices keep their own rent
  update categories set
    name = case when p ? 'name' then trim(p->>'name') else name end,
    rent = case when p ? 'rent' then v_rent else rent end
  where id = v_cid;
  return jsonb_build_object('id', v_cid);
end $$;

create or replace function public.api_delete_category(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_cid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_category(v_cid, v_uid);
  if exists (select 1 from bookings b join rooms r on r.id = b.room_id
             where r.category_id = v_cid and b.status <> 'moved_out') then
    perform public._err('CATEGORY_HAS_BOOKING', 'A room in this category has a tenant. Move the tenant out first.');
  end if;
  -- archive (not delete) so old bookings, invoices and meter readings keep working
  update beds set archived_at = now() where archived_at is null and room_id in (select id from rooms where category_id = v_cid);
  update rooms set archived_at = now() where archived_at is null and category_id = v_cid;
  update categories set archived_at = now() where id = v_cid;
  return jsonb_build_object('archived', true);
end $$;

create or replace function public.api_add_room(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id'); v_cat categories; v_prop properties;
  v_no text := trim(coalesce(p->>'room_no', '')); v_rid bigint; v_i int; v_bpr int;
begin
  perform public._assert_write(v_uid);
  perform public._chk_property(v_pid, v_uid);
  perform public._chk_category(public._bid(p->>'category_id'), v_uid);
  select * into v_cat from categories where id = public._bid(p->>'category_id');
  if v_cat.property_id <> v_pid then perform public._nf(); end if;
  select * into v_prop from properties where id = v_pid;
  if v_no = '' then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  if exists (select 1 from rooms where property_id = v_pid and archived_at is null and lower(room_no) = lower(v_no)) then
    perform public._err('ROOM_EXISTS', 'Room ' || v_no || ' already exists in this property.');
  end if;
  v_bpr := case when v_prop.type = 'BED' then coalesce(v_cat.beds_per_room, 1) else 0 end;
  perform public._check_units(v_uid, greatest(v_bpr, 1));
  insert into rooms(property_id, category_id, room_no) values (v_pid, v_cat.id, v_no) returning id into v_rid;
  for v_i in 1 .. v_bpr loop insert into beds(room_id, label) values (v_rid, chr(64 + v_i)); end loop;
  return jsonb_build_object('id', v_rid);
end $$;

create or replace function public.api_delete_room(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_rid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_room(v_rid, v_uid);
  if exists (select 1 from bookings where room_id = v_rid and status <> 'moved_out') then
    perform public._err('ROOM_HAS_BOOKING', 'This room has a tenant. Move the tenant out first.');
  end if;
  update beds set archived_at = now() where room_id = v_rid and archived_at is null;
  update rooms set archived_at = now() where id = v_rid;
  return jsonb_build_object('archived', true);
end $$;

create or replace function public.api_add_bed(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_rid bigint := public._bid(p->>'id'); v_i int := 1; v_bid bigint; v_type text;
begin
  perform public._assert_write(v_uid);
  perform public._chk_room(v_rid, v_uid);
  select pr.type into v_type from rooms r join properties pr on pr.id = r.property_id where r.id = v_rid;
  if v_type <> 'BED' then perform public._err('E_VALIDATION', 'Beds are only for bed-wise properties.'); end if;
  perform public._check_units(v_uid, 1);
  while exists (select 1 from beds where room_id = v_rid and archived_at is null and label = chr(64 + v_i)) loop
    v_i := v_i + 1;
  end loop;
  insert into beds(room_id, label) values (v_rid, chr(64 + v_i)) returning id into v_bid;
  return jsonb_build_object('id', v_bid, 'label', chr(64 + v_i));
end $$;

create or replace function public.api_delete_bed(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_bed(v_bid, v_uid);
  if exists (select 1 from bookings where bed_id = v_bid and status <> 'moved_out') then
    perform public._err('BED_HAS_BOOKING', 'This bed has a tenant. Move the tenant out first.');
  end if;
  update beds set archived_at = now() where id = v_bid;
  return jsonb_build_object('archived', true);
end $$;

-- ---------------------------------------------------------------------
-- METERS
-- ---------------------------------------------------------------------
create or replace function public.api_get_meters(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
begin
  perform public._chk_property(v_pid, v_uid);
  return coalesce((select jsonb_agg(row_json order by sort1, sort2) from (
    select jsonb_build_object('room_id', r.id, 'room_no', r.room_no,
      'latest',   case when l.id is null then null else public._rd_json(l.id) end,
      'previous', case when pv.id is null then null else public._rd_json(pv.id) end,
      'units_used', case when pv.id is not null and not l.is_reset then l.value - pv.value else null end) as row_json,
      lpad(regexp_replace(r.room_no, '\D', '', 'g'), 12, '0') as sort1, r.room_no as sort2
    from rooms r
    left join lateral (select * from meter_readings m where m.room_id = r.id order by m.created_at desc, m.id desc limit 1) l on true
    left join lateral (select * from meter_readings m where m.room_id = r.id order by m.created_at desc, m.id desc limit 1 offset 1) pv on true
    where r.property_id = v_pid and r.archived_at is null) x), '[]'::jsonb);
end $$;

create or replace function public.api_get_readings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_rid bigint := public._bid(p->>'id');
begin
  perform public._chk_room(v_rid, v_uid);
  return coalesce((select jsonb_agg(public._rd_json(id) order by created_at desc, id desc)
                   from meter_readings where room_id = v_rid), '[]'::jsonb);
end $$;

create or replace function public.api_add_reading(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_rid bigint := public._bid(p->>'id'); v_val numeric := public._num(p->>'value');
begin
  perform public._assert_write(v_uid);
  perform public._chk_room(v_rid, v_uid);
  if v_val is null or v_val < 0 then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  -- append-only: a new row every time, never an edit of an old reading
  return public._save_reading(v_uid, v_rid, v_val, coalesce((p->>'is_reset')::boolean, false),
                              nullif(p->>'photo_key', ''), true);
end $$;

-- ---------------------------------------------------------------------
-- TENANTS (the person) and their documents
-- ---------------------------------------------------------------------
create or replace function public.api_get_tenants(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_d text; v_st text := nullif(p->>'status', ''); v_pid bigint := public._bid(p->>'property_id');
begin
  v_d := regexp_replace(coalesce(v_s, ''), '\D', '', 'g');
  return coalesce((select jsonb_agg(public._tenant_row(t.id) order by lower(t.name), t.id)
    from tenants t where t.user_id = v_uid
      and (v_s is null or t.name ilike '%' || v_s || '%' or (v_d <> '' and t.phone like '%' || v_d || '%'))
      and (v_pid is null or exists (select 1 from bookings b where b.tenant_id = t.id and b.property_id = v_pid))
      and (v_st is null
           or (v_st = 'live' and exists (select 1 from bookings b where b.tenant_id = t.id and b.status <> 'moved_out'))
           or (v_st = 'moved_out' and not exists (select 1 from bookings b where b.tenant_id = t.id and b.status <> 'moved_out')
               and exists (select 1 from bookings b where b.tenant_id = t.id)))), '[]'::jsonb);
end $$;

create or replace function public.api_get_tenant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_tid bigint := public._bid(p->>'id');
begin
  perform public._chk_tenant(v_tid, v_uid);
  return (public._tenant_row(v_tid) - 'live_bookings' - 'bookings_count' - 'total_balance')
    || jsonb_build_object('bookings', coalesce((select jsonb_agg(public._bk_json(id) order by start_date desc, id desc)
                          from bookings where tenant_id = v_tid), '[]'::jsonb));
end $$;

create or replace function public.api_get_tenant_bookings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_tid bigint := public._bid(p->>'id');
begin
  perform public._chk_tenant(v_tid, v_uid);
  return coalesce((select jsonb_agg(public._bk_json(id) order by start_date desc, id desc)
                   from bookings where tenant_id = v_tid), '[]'::jsonb);
end $$;

create or replace function public.api_add_tenant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint; v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
begin
  perform public._assert_write(v_uid);
  if coalesce(trim(p->>'name'), '') = '' or (v_ph is not null and v_ph !~ '^[6-9][0-9]{9}$') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  insert into tenants(user_id, name, phone, photo_key)
  values (v_uid, trim(p->>'name'), v_ph, nullif(p->>'photo_key', '')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_update_tenant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_tid bigint := public._bid(p->>'id');
  v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
begin
  perform public._assert_write(v_uid);
  perform public._chk_tenant(v_tid, v_uid);
  if (p ? 'name' and trim(coalesce(p->>'name', '')) = '') or (p ? 'phone' and v_ph is not null and v_ph !~ '^[6-9][0-9]{9}$') then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  -- one update changes the phone on every booking of this person
  update tenants set
    name      = case when p ? 'name' then trim(p->>'name') else name end,
    phone     = case when p ? 'phone' then v_ph else phone end,
    photo_key = case when p ? 'photo_key' then nullif(p->>'photo_key', '') else photo_key end
  where id = v_tid;
  return jsonb_build_object('id', v_tid);
end $$;

create or replace function public.api_add_tenant_document(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_tid bigint := public._bid(p->>'id'); v_kind text := p->>'kind'; v_id bigint;
begin
  perform public._assert_write(v_uid);
  perform public._chk_tenant(v_tid, v_uid);
  if v_kind not in ('aadhaar_front','aadhaar_back','other_id') or coalesce(p->>'file_key', '') = '' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  if split_part(p->>'file_key', '/', 1) <> (select auth_id::text from users where id = v_uid) then perform public._nf(); end if;
  -- Aadhaar front and back replace the older file; other_id can be added many times
  if v_kind in ('aadhaar_front','aadhaar_back') then delete from tenant_documents where tenant_id = v_tid and kind = v_kind; end if;
  insert into tenant_documents(tenant_id, kind, file_key, mime_type)
  values (v_tid, v_kind, p->>'file_key', coalesce(nullif(p->>'mime_type', ''), 'image/jpeg')) returning id into v_id;
  return (select jsonb_build_object('id', id, 'tenant_id', tenant_id, 'kind', kind, 'file_key', file_key, 'mime_type', mime_type)
          from tenant_documents where id = v_id);
end $$;

create or replace function public.api_remove_tenant_document(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_did bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  if not exists (select 1 from tenant_documents d join tenants t on t.id = d.tenant_id where d.id = v_did and t.user_id = v_uid) then
    perform public._nf();
  end if;
  delete from tenant_documents where id = v_did;
  return jsonb_build_object('deleted', true);
end $$;

-- ---------------------------------------------------------------------
-- BOOKINGS (one stay = one ledger)
-- ---------------------------------------------------------------------
create or replace function public.api_get_bookings(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_st text := nullif(p->>'status', '');
  v_pid bigint := public._bid(p->>'property_id'); v_tid bigint := public._bid(p->>'tenant_id');
begin
  return coalesce((select jsonb_agg(public._bk_json(b.id) order by b.id desc)
    from bookings b join properties pr on pr.id = b.property_id
    where pr.user_id = v_uid
      and (v_st is null or (v_st = 'live' and b.status <> 'moved_out') or b.status = v_st)
      and (v_pid is null or b.property_id = v_pid) and (v_tid is null or b.tenant_id = v_tid)), '[]'::jsonb);
end $$;

create or replace function public.api_get_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._chk_booking(v_bid, v_uid);
  return public._bk_json(v_bid, true);
end $$;

create or replace function public.api_get_ledger(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._chk_booking(v_bid, v_uid);
  return jsonb_build_object('summary', public._bk_summary(v_bid),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'period_start', i.period_start,
        'period_end', i.period_end, 'total', i.total, 'paid', i.paid, 'cancelled', i.cancelled) order by i.period_start desc, i.id desc)
        from invoices i where i.booking_id = v_bid), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mode', m.mode, 'amount', m.amount,
        'ref_no', m.ref_no, 'paid_on', m.paid_on) order by m.paid_on desc, m.id desc)
        from payments m where m.booking_id = v_bid), '[]'::jsonb));
end $$;

create or replace function public.api_add_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_sd date := public._date(p->>'start_date'); v_ed date := public._date(p->>'end_date');
  v_st text := coalesce(nullif(p->>'status', ''), 'active'); v_id bigint;
begin
  perform public._assert_write(v_uid);
  if v_sd is null or v_st not in ('reserved','active') or (v_ed is not null and v_ed < v_sd)
     or coalesce(public._num(p->>'deposit'), 0) < 0 or coalesce(public._num(p->>'advance'), 0) < 0 then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  v_id := public._new_booking(v_uid, public._bid(p->>'tenant_id'), public._bid(p->>'room_id'), public._bid(p->>'bed_id'),
            v_sd, v_ed, v_st, public._num(p->>'deposit'), public._num(p->>'advance'));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_update_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id'); b bookings;
  v_sd date; v_ed date; v_dep numeric;
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  select * into b from bookings where id = v_bid;
  v_sd  := case when p ? 'start_date' then public._date(p->>'start_date') else b.start_date end;
  v_ed  := case when p ? 'end_date' then public._date(p->>'end_date') else b.end_date end;
  v_dep := case when p ? 'deposit' then public._num(p->>'deposit') else b.deposit end;
  if v_sd is null or v_dep is null or v_dep < 0 or (v_ed is not null and v_ed < v_sd) then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  update bookings set start_date = v_sd, end_date = v_ed, deposit = v_dep where id = v_bid;
  return jsonb_build_object('id', v_bid);
end $$;

create or replace function public.api_delete_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if exists (select 1 from invoices where booking_id = v_bid) or exists (select 1 from payments where booking_id = v_bid) then
    perform public._err('BOOKING_HAS_MONEY', 'This booking has invoices or payments, so it cannot be removed. Move the tenant out instead.');
  end if;
  delete from bookings where id = v_bid;
  return jsonb_build_object('deleted', true);
end $$;

create or replace function public.api_activate_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  update bookings set status = 'active' where id = v_bid and status = 'reserved';
  if not found then perform public._err('E_VALIDATION', 'Only a reservation can be activated.'); end if;
  return jsonb_build_object('id', v_bid);
end $$;

create or replace function public.api_give_notice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
  v_nd date := public._date(p->>'notice_date'); v_ld date := public._date(p->>'leave_date');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if v_nd is null or v_ld is null or v_ld < v_nd then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  update bookings set status = 'notice', notice_date = v_nd, leave_date = v_ld where id = v_bid and status = 'active';
  if not found then perform public._err('E_VALIDATION', 'Notice can be given to an active booking only.'); end if;
  return jsonb_build_object('id', v_bid);
end $$;

create or replace function public.api_cancel_notice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  update bookings set status = 'active', notice_date = null, leave_date = null where id = v_bid and status = 'notice';
  if not found then perform public._err('E_VALIDATION', 'This booking is not on notice.'); end if;
  return jsonb_build_object('id', v_bid);
end $$;

create or replace function public.api_move_out(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id'); b bookings;
  v_od date := coalesce(public._date(p->>'out_date'), current_date);
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  select * into b from bookings where id = v_bid for update;
  if b.status = 'moved_out' then perform public._err('ALREADY_MOVED_OUT', 'This booking is already moved out.'); end if;
  -- frees the room or bed, settles the balance (collect, write off, refund or keep pending)
  perform public._settle_close(v_bid, v_od, p);
  return jsonb_build_object('id', v_bid);
end $$;

-- room or bed change: close this booking, open a new one that starts at zero
create or replace function public.api_transfer_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id'); b bookings;
  v_sd date := public._date(p->>'start_date'); v_new bigint;
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  select * into b from bookings where id = v_bid for update;
  if b.status = 'moved_out' then perform public._err('ALREADY_MOVED_OUT', 'This booking is already moved out.'); end if;
  if v_sd is null then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  perform public._settle_close(v_bid, v_sd, p);
  v_new := public._new_booking(v_uid, b.tenant_id, public._bid(p->>'room_id'), public._bid(p->>'bed_id'),
             v_sd, null, 'active', coalesce(public._num(p->>'deposit'), 0), 0);
  return jsonb_build_object('old_booking', jsonb_build_object('id', v_bid), 'new_booking', jsonb_build_object('id', v_new));
end $$;

create or replace function public.api_set_agreement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if coalesce(p->>'file_key', '') = '' then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  if split_part(p->>'file_key', '/', 1) <> (select auth_id::text from users where id = v_uid) then perform public._nf(); end if;
  update bookings set agreement_file_key = p->>'file_key' where id = v_bid;
  return jsonb_build_object('id', v_bid);
end $$;

-- ---------------------------------------------------------------------
-- INVOICES
-- ---------------------------------------------------------------------
create or replace function public.api_get_invoices(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'property_id'); v_bid bigint := public._bid(p->>'booking_id');
  v_month text := nullif(p->>'month', ''); v_due boolean := coalesce(p->>'due', '') = 'true'; v_can text := nullif(p->>'cancelled', '');
begin
  return coalesce((select jsonb_agg(public._inv_json(i.id) order by i.created_at desc, i.id desc)
    from invoices i join bookings b on b.id = i.booking_id join properties pr on pr.id = b.property_id
    where pr.user_id = v_uid
      and (v_pid is null or b.property_id = v_pid) and (v_bid is null or i.booking_id = v_bid)
      and (v_month is null or to_char(i.period_start, 'YYYY-MM') = v_month)
      and (not v_due or (not i.cancelled and i.paid < i.total))
      and (v_can is null or i.cancelled = (v_can = 'true'))), '[]'::jsonb);
end $$;

create or replace function public.api_get_invoice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_iid bigint := public._bid(p->>'id');
begin
  perform public._chk_invoice(v_iid, v_uid);
  return public._inv_json(v_iid, true);
end $$;

-- defaults for the invoice form: rent, the last two meter readings, last rate, people sharing
create or replace function public.api_invoice_preview(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id'); b bookings;
  v_rent numeric; v_n int; v_last numeric; v_prev numeric; v_rate numeric; v_split int; v_lpe date;
begin
  perform public._chk_booking(v_bid, v_uid);
  select * into b from bookings where id = v_bid;
  select c.rent into v_rent from rooms r join categories c on c.id = r.category_id where r.id = b.room_id;
  select count(*) into v_n from meter_readings where room_id = b.room_id;
  select value into v_last from meter_readings where room_id = b.room_id order by created_at desc, id desc limit 1;
  select value into v_prev from meter_readings where room_id = b.room_id order by created_at desc, id desc limit 1 offset 1;
  select i.rate into v_rate from invoices i join bookings bb on bb.id = i.booking_id
   where bb.room_id = b.room_id and i.rate is not null and not i.cancelled order by i.created_at desc, i.id desc limit 1;
  select greatest(count(*), 1) into v_split from bookings where room_id = b.room_id and status <> 'moved_out';
  select max(period_end) into v_lpe from invoices where booking_id = v_bid and not cancelled;
  return jsonb_build_object('rent', coalesce(v_rent, 0),
    'start_reading', case when v_n >= 2 then v_prev when v_n = 1 then v_last else null end,
    'end_reading',   case when v_n >= 2 then v_last else null end,
    'rate', v_rate, 'split_count', v_split, 'last_period_end', v_lpe);
end $$;

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
  return public._inv_json(v_iid, true);
end $$;

create or replace function public.api_update_invoice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_iid bigint := public._bid(p->>'id'); i invoices; b bookings;
  v_ps date; v_pe date; v_rent numeric; v_rate numeric; v_sr numeric; v_er numeric; v_split int; v_elec numeric; v_esum numeric;
  v_reset boolean := coalesce((p->>'meter_reset')::boolean, false); v_ex jsonb; v_total numeric; v_over numeric;
begin
  perform public._assert_write(v_uid);
  perform public._chk_invoice(v_iid, v_uid);
  select * into i from invoices where id = v_iid for update;
  if i.cancelled then perform public._err('INVOICE_CANCELLED', 'A cancelled invoice cannot be edited.'); end if;
  select * into b from bookings where id = i.booking_id;

  v_ps    := case when p ? 'period_start' then public._date(p->>'period_start') else i.period_start end;
  v_pe    := case when p ? 'period_end'   then public._date(p->>'period_end')   else i.period_end end;
  v_rent  := case when p ? 'rent'  then public._num(p->>'rent')  else i.rent end;
  v_rate  := case when p ? 'rate'  then public._num(p->>'rate')  else i.rate end;
  v_sr    := case when p ? 'start_reading' then public._num(p->>'start_reading') else i.start_reading end;
  v_er    := case when p ? 'end_reading'   then public._num(p->>'end_reading')   else i.end_reading end;
  v_split := greatest(1, coalesce(public._num(p->>'split_count'), i.split_count))::int;
  if v_ps is null or v_pe is null or v_pe < v_ps or v_rent is null or v_rent < 0 then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;

  if p ? 'extras' then
    for v_ex in select * from jsonb_array_elements(coalesce(p->'extras', '[]'::jsonb)) loop
      if coalesce(trim(v_ex->>'name'), '') = '' or public._num(v_ex->>'amount') is null then
        perform public._err('E_VALIDATION', 'Please check the extra charges.');
      end if;
    end loop;
    delete from invoice_items where invoice_id = v_iid;
    for v_ex in select * from jsonb_array_elements(coalesce(p->'extras', '[]'::jsonb)) loop
      insert into invoice_items(invoice_id, name, amount) values (v_iid, trim(v_ex->>'name'), public._num(v_ex->>'amount'));
    end loop;
  end if;

  -- a changed end reading becomes a new reading only if it is not lower than the room's latest (or the meter was reset)
  if p ? 'end_reading' and v_er is not null then
    perform public._save_reading(v_uid, b.room_id, v_er, v_reset, null, false);
  end if;

  select coalesce(sum(amount), 0) into v_esum from invoice_items where invoice_id = v_iid;
  v_elec  := public._electricity(v_sr, v_er, v_rate, v_split);
  v_total := v_rent + v_elec + v_esum;
  -- if the invoice became smaller than what was paid, the extra goes to advance
  v_over := greatest(i.paid - v_total, 0);
  update invoices set period_start = v_ps, period_end = v_pe, rent = v_rent, start_reading = v_sr, end_reading = v_er,
    rate = v_rate, split_count = v_split, electricity = v_elec, total = v_total, paid = i.paid - v_over where id = v_iid;
  if v_over > 0 then update bookings set advance = advance + v_over where id = b.id; end if;
  return public._inv_json(v_iid, true);
end $$;

create or replace function public.api_cancel_invoice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_iid bigint := public._bid(p->>'id'); i invoices;
begin
  perform public._assert_write(v_uid);
  perform public._chk_invoice(v_iid, v_uid);
  select * into i from invoices where id = v_iid for update;
  if i.cancelled then perform public._err('ALREADY_CANCELLED', 'This invoice is already cancelled.'); end if;
  -- flag it, drop it from the balance, and move what was paid on it to the booking's advance
  update invoices set cancelled = true where id = v_iid;
  if i.paid > 0 then update bookings set advance = advance + i.paid where id = i.booking_id; end if;
  return public._inv_json(v_iid, true);
end $$;

-- ---------------------------------------------------------------------
-- PAYMENTS and BALANCES
-- ---------------------------------------------------------------------
create or replace function public.api_get_payments(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_month text := nullif(p->>'month', ''); v_s text := nullif(trim(coalesce(p->>'search', '')), '');
  v_d text; v_pid bigint := public._bid(p->>'property_id'); v_arr jsonb; v_tot numeric;
begin
  v_d := regexp_replace(coalesce(v_s, ''), '\D', '', 'g');
  select coalesce(jsonb_agg(jsonb_build_object('id', pm.id, 'booking_id', pm.booking_id, 'mode', pm.mode, 'amount', pm.amount,
           'ref_no', pm.ref_no, 'paid_on', pm.paid_on, 'booking', public._bk_ref(pm.booking_id))
           order by pm.paid_on desc, pm.id desc), '[]'::jsonb),
         coalesce(sum(pm.amount), 0)
    into v_arr, v_tot
    from payments pm join bookings b on b.id = pm.booking_id join properties pr on pr.id = b.property_id
    join tenants t on t.id = b.tenant_id
   where pr.user_id = v_uid
     and (v_pid is null or b.property_id = v_pid)
     and (v_month is null or to_char(pm.paid_on, 'YYYY-MM') = v_month)
     and (v_s is null or pm.ref_no ilike '%' || v_s || '%' or (v_d <> '' and t.phone like '%' || v_d || '%'));
  return jsonb_build_object('total', v_tot, 'payments', v_arr);
end $$;

create or replace function public.api_add_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'booking_id'); v_amt numeric := public._num(p->>'amount');
  v_d date := public._date(p->>'paid_on'); v_r jsonb;
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if v_amt is null or v_amt <= 0 or v_d is null or coalesce(p->>'mode', '') not in ('cash','upi','bank')
     or coalesce(trim(p->>'ref_no'), '') = '' then
    perform public._err('E_VALIDATION', 'Please check the details you entered.');
  end if;
  -- goes to the oldest unpaid invoice first; any extra becomes advance
  v_r := public._record_payment(v_bid, p->>'mode', v_amt, p->>'ref_no', v_d);
  return jsonb_build_object(
    'payment', (select jsonb_build_object('id', pm.id, 'booking_id', pm.booking_id, 'mode', pm.mode, 'amount', pm.amount,
                  'ref_no', pm.ref_no, 'paid_on', pm.paid_on, 'booking', public._bk_ref(pm.booking_id))
                from payments pm where pm.id = (v_r->>'payment_id')::bigint),
    'applied', v_r->'applied', 'to_advance', (v_r->>'to_advance')::numeric, 'balance', public._bk_balance(v_bid));
end $$;

create or replace function public.api_get_balances(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_due boolean := coalesce(p->>'due', '') = 'true';
  v_pid bigint := public._bid(p->>'property_id'); v_st text := nullif(p->>'status', '');
begin
  return coalesce((select jsonb_agg(public._bk_json(x.id) - 'agreement_file_key' - 'deposit' - 'advance' - 'written_off'
                     - 'settle_mode' - 'start_date' - 'end_date' - 'notice_date' - 'leave_date' - 'out_date' - 'tenant_id' - 'room_id' - 'bed_id'
                     || jsonb_build_object('booking_id', x.id) order by x.id desc)
    from (select b.id, public._bk_balance(b.id) as bal, b.status, b.property_id
          from bookings b join properties pr on pr.id = b.property_id where pr.user_id = v_uid) x
    where (x.status <> 'moved_out' or x.bal <> 0)
      and (not v_due or x.bal > 0) and (v_pid is null or x.property_id = v_pid)
      and (v_st is null or (v_st = 'live' and x.status <> 'moved_out') or x.status = v_st)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- LOCK DOWN who can call what, then refresh the API
-- ---------------------------------------------------------------------
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
-- =====================================================================
-- OWNER APP  |  PART 5: lead talk history and next-action history
-- Run once after part 4. Safe to run again.
-- =====================================================================

create table if not exists public.lead_logs (
  id          bigint generated always as identity primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  kind        text not null check (kind in ('talk','next')),
  text        text not null,
  due_date    date,                          -- only for kind = 'next': the day the action is planned
  created_at  timestamptz not null default now()
);
create index if not exists lead_logs_lead_idx on public.lead_logs(lead_id, created_at desc);
alter table public.lead_logs enable row level security;
revoke all on public.lead_logs from anon, authenticated;

-- keep what was already typed in the old single fields, as the first history entries
insert into public.lead_logs(lead_id, kind, text, created_at)
select l.id, 'talk', l.last_talk, coalesce(l.last_talk_at, l.created_at) from public.leads l
 where l.last_talk is not null and not exists (select 1 from public.lead_logs g where g.lead_id = l.id and g.kind = 'talk');
insert into public.lead_logs(lead_id, kind, text, due_date, created_at)
select l.id, 'next', l.next_action, l.next_action_at, l.created_at from public.leads l
 where l.next_action is not null and not exists (select 1 from public.lead_logs g where g.lead_id = l.id and g.kind = 'next');

-- one lead with its full history (newest first)
create or replace function public.api_get_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id');
begin
  if not exists (select 1 from leads where id = v_id and user_id = v_uid) then perform public._nf(); end if;
  return public._lead_json(v_id) || jsonb_build_object('logs', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'text', g.text, 'due_date', g.due_date,
             'created_at', g.created_at) order by g.created_at desc, g.id desc)
    from lead_logs g where g.lead_id = v_id), '[]'::jsonb));
end $$;

-- last_talk and next_action are now NEW entries: each one is added to the history, the old ones stay
create or replace function public.api_update_lead(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_id bigint := public._bid(p->>'id'); l leads;
  v_ph text := nullif(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), '');
  v_pid bigint := public._bid(p->>'property_id'); v_date date := public._date(p->>'next_action_at');
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
  if p ? 'property_id' and v_pid is not null then perform public._chk_property(v_pid, v_uid); end if;
  v_due := case when p ? 'next_action_at' then v_date else l.next_action_at end;

  if v_talk is not null then insert into lead_logs(lead_id, kind, text) values (v_id, 'talk', v_talk); end if;
  if v_act  is not null then insert into lead_logs(lead_id, kind, text, due_date) values (v_id, 'next', v_act, v_due); end if;

  update leads set
    name           = case when p ? 'name' then trim(p->>'name') else name end,
    phone          = case when p ? 'phone' then v_ph else phone end,
    property_id    = case when p ? 'property_id' then v_pid else property_id end,
    note           = case when p ? 'note' then nullif(trim(coalesce(p->>'note', '')), '') else note end,
    status         = case when p ? 'status' then p->>'status' else status end,
    last_talk      = coalesce(v_talk, last_talk),
    last_talk_at   = case when v_talk is not null then now() else last_talk_at end,
    next_action    = coalesce(v_act, next_action),
    next_action_at = v_due
  where id = v_id;
  return public._lead_json(v_id);
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
-- =====================================================================
-- KirayaSaathi  |  PART 8: change the move-out date of a tenant who is already on notice
-- Run once after part 7. Safe to run again.
-- =====================================================================
create or replace function public.api_give_notice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
  v_nd date := public._date(p->>'notice_date'); v_ld date := public._date(p->>'leave_date');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if v_nd is null or v_ld is null or v_ld < v_nd then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  -- an active stay gets a notice; a stay already on notice only gets new dates
  update bookings set status = 'notice', notice_date = v_nd, leave_date = v_ld where id = v_bid and status in ('active', 'notice');
  if not found then perform public._err('E_VALIDATION', 'Notice can be given to an active booking only.'); end if;
  return jsonb_build_object('id', v_bid);
end $$;
notify pgrst, 'reload schema';


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
