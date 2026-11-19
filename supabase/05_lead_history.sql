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
