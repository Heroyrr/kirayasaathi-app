-- =====================================================================
-- PART 20: plan expiry -> every live property goes offline ON THE EXPIRY MOMENT (no 7-day wait)
--          plan bought / renewed -> those properties go live again AUTOMATICALLY
--          expired plan -> "go live" and "edit a live listing" are refused with PLAN_EXPIRED
-- Run once in Supabase > SQL Editor AFTER 19. Safe to run again.
-- First turn ON the extension:  Database > Extensions > pg_cron
-- (The 7-day grace is untouched: rent, tenants, invoices keep working in grace. Only the public listing is cut.)
-- =====================================================================

-- ---------- 1. remember which properties WE took offline (so only those come back on renewal) ----------
alter table public.properties add column if not exists paused_by_plan boolean not null default false;
create index if not exists properties_paused_idx on public.properties(user_id) where paused_by_plan;
create index if not exists subscriptions_ends_idx on public.subscriptions(ends_at);

-- ---------- 2. helpers ----------
create or replace function public._plan_active(uid bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.ends_at >= now() from subscriptions s where s.user_id = uid), false)
$$;
revoke all on function public._plan_active(bigint) from public, anon, authenticated;

create or replace function public._assert_plan_active(uid bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._plan_active(uid) then
    perform public._err('PLAN_EXPIRED', 'Your plan has expired. Renew your plan to make a property live.', 403);
  end if;
end $$;
revoke all on function public._assert_plan_active(bigint) from public, anon, authenticated;

-- ---------- 3. the sweep: expired owner -> all their live properties offline ----------
create or replace function public.plan_expire_sweep() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update properties p set is_live = false, paused_by_plan = true
   where p.is_live
     and exists (select 1 from subscriptions s where s.user_id = p.user_id and s.ends_at < now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.plan_expire_sweep() from public, anon, authenticated;

-- ---------- 4. renewal: plan extended into the future -> bring the paused properties back ----------
create or replace function public._plan_renewed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if new.ends_at < now() then return new; end if;
  for r in select id from properties where user_id = new.user_id and paused_by_plan order by live_at, id loop
    if public._listing_problem(r.id) is null then
      update properties set is_live = true, paused_by_plan = false, live_at = coalesce(live_at, now()) where id = r.id;
    else
      update properties set paused_by_plan = false where id = r.id;   -- incomplete: owner finishes it and goes live
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists subscriptions_renewed on public.subscriptions;
create trigger subscriptions_renewed
  after insert or update of ends_at, plan on public.subscriptions
  for each row execute function public._plan_renewed();

-- ---------- 5. the guard: one place that refuses going live / editing a live listing when the plan is over ----------
-- (a trigger, so no app screen or future function can forget the check; saving a draft of an OFFLINE property still works)
create or replace function public._properties_plan_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_live and (
       not old.is_live
       or (new.address, new.pincode, new.state, new.city, new.locality, new.landmark, new.lat, new.lng,
           new.min_rent, new.security_deposit, new.amenities, new.unit_types, new.photo_keys)
          is distinct from
          (old.address, old.pincode, old.state, old.city, old.locality, old.landmark, old.lat, old.lng,
           old.min_rent, old.security_deposit, old.amenities, old.unit_types, old.photo_keys)) then
    perform public._assert_plan_active(new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists properties_plan_guard on public.properties;
create trigger properties_plan_guard
  before update on public.properties
  for each row execute function public._properties_plan_guard();

-- ---------- 6. api_set_live: clear error first; offline is always allowed; manual choice clears the "paused" mark ----------
create or replace function public.api_set_live(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_pid bigint := public._bid(p->>'id');
  v_live boolean := coalesce((p->>'live')::boolean, false); v_bad text;
begin
  perform public._chk_property(v_pid, v_uid);
  if v_live then
    perform public._assert_plan_active(v_uid);
    perform public._assert_write(v_uid);
    v_bad := public._listing_problem(v_pid);
    if v_bad is not null then
      perform public._err('LISTING_INCOMPLETE', 'Complete the listing first. Missing: ' || v_bad || '.');
    end if;
    update properties set is_live = true, paused_by_plan = false, live_at = coalesce(live_at, now()) where id = v_pid;
  else
    update properties set is_live = false, paused_by_plan = false where id = v_pid;
  end if;
  return public._prop_row(v_pid);
end $$;

-- ---------- 7. run the sweep every minute, and once now for owners who are already expired ----------
create extension if not exists pg_cron;
select cron.schedule('plan-expire-sweep', '* * * * *', $$select public.plan_expire_sweep()$$);
select public.plan_expire_sweep() as properties_taken_offline_now;
