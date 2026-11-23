-- =====================================================================
-- OWNER APP (KirayaSaathi)  |  PART 15: notification list + on/off switch
-- Run once in Supabase > SQL Editor AFTER 14. Safe to run again.
--
-- What it adds
--   1. users.push_enabled            : owner can switch push on/off in More (default ON)
--   2. user_notifications            : every notification is saved for the owner (bell icon list, with date + time)
--   3. _push_send()                  : now saves the notification AND sends the push (only to owners who have push ON)
--   4. api_get_notifications / api_read_notifications / api_set_push_pref : used by the app
--   5. new-lead push text            : "New lead from RoomIndeed"
-- =====================================================================

-- ---------- 1. on/off switch (default ON) ----------
alter table public.users add column if not exists push_enabled boolean not null default true;

-- ---------- 2. saved notifications ----------
create table if not exists public.user_notifications (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text not null default 'notice',          -- lead | notice | ...
  url         text,                                    -- screen to open on tap, for example /leads/12
  notice_id   bigint,                                  -- set for admin notices (stops duplicates)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists user_notifications_user_idx on public.user_notifications(user_id, id desc);
create unique index if not exists user_notifications_notice_uq on public.user_notifications(user_id, notice_id);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon, authenticated;

-- old notices (part 14) also appear in the new list, already marked as read
insert into public.user_notifications(user_id, title, body, type, url, notice_id, read_at, created_at)
select u.id, n.title, n.body, 'notice', coalesce(n.screen, '/notices'), n.id, now(), n.created_at
  from public.app_notices n
  join public.users u on (n.audience = 'all' or u.id = any(n.user_ids))
 where u.disabled_at is null
on conflict (user_id, notice_id) do nothing;

-- ---------- 3. save + send ----------
-- p_user_ids = owners to notify. Never raises an error, so a push problem can never break the real action.
create or replace function public._push_send(p_user_ids bigint[], p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_secret text; v_send bigint[]; v_nid bigint; v_link text;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then return; end if;

  -- a) keep it in the owner's notification list (even when push is switched off)
  begin
    v_nid  := nullif(p_data->>'notice_id', '')::bigint;
    v_link := nullif(p_data->>'url', '');
    insert into user_notifications(user_id, title, body, type, url, notice_id)
    select u.id, p_title, p_body, coalesce(nullif(p_data->>'type', ''), 'notice'), v_link, v_nid
      from users u where u.id = any(p_user_ids)
    on conflict (user_id, notice_id) do nothing;
  exception when others then
    raise warning 'notification not saved: %', sqlerrm;
  end;

  -- b) push only to owners who kept push ON
  select array_agg(id) into v_send from users where id = any(p_user_ids) and push_enabled;
  if coalesce(array_length(v_send, 1), 0) = 0 then return; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url'  limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_url is null or v_secret is null then
    raise warning 'push not sent: add push_function_url and push_webhook_secret to Vault (see 13_push_notifications.sql)';
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('user_ids', to_jsonb(v_send), 'title', p_title, 'body', p_body, 'data', coalesce(p_data, '{}'::jsonb))
  );
exception when others then
  raise warning 'push not sent: %', sqlerrm;
end $$;

-- ---------- 4. new lead from the RoomIndeed website ----------
create or replace function public._lead_push_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source = 'roomindeed' then
    perform public._push_send(
      array[new.user_id],
      'New lead from RoomIndeed',
      new.name || ' · +91 ' || coalesce(new.phone, ''),
      jsonb_build_object('type', 'lead', 'lead_id', new.id, 'url', '/leads/' || new.id));
  end if;
  return new;
exception when others then
  raise warning 'lead push failed: %', sqlerrm;
  return new;      -- the lead is always saved
end $$;

-- ---------- 5. app calls ----------
-- the list (newest first) + how many are unread + the on/off switch
create or replace function public.api_get_notifications(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  return jsonb_build_object(
    'push_enabled', coalesce((select push_enabled from users where id = v_uid), true),
    'unread', (select count(*) from user_notifications where user_id = v_uid and read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'type', n.type,
                                          'url', n.url, 'read', n.read_at is not null, 'created_at', n.created_at)
                       order by n.id desc)
        from (select * from user_notifications where user_id = v_uid order by id desc limit 100) n
    ), '[]'::jsonb));
end $$;

-- opening the list marks everything as read
create or replace function public.api_read_notifications(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  update user_notifications set read_at = now() where user_id = v_uid and read_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- the switch in More > Settings
create or replace function public.api_set_push_pref(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_on boolean := coalesce((p->>'enabled')::boolean, true);
begin
  update users set push_enabled = v_on where id = v_uid;
  return jsonb_build_object('ok', true, 'push_enabled', v_on);
end $$;

-- ---------- 6. permissions ----------
revoke all on function public._push_send(bigint[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public._lead_push_trigger() from public, anon, authenticated;
revoke all on function public.api_get_notifications(jsonb) from public, anon;
revoke all on function public.api_read_notifications(jsonb) from public, anon;
revoke all on function public.api_set_push_pref(jsonb) from public, anon;
grant execute on function public.api_get_notifications(jsonb) to authenticated;
grant execute on function public.api_read_notifications(jsonb) to authenticated;
grant execute on function public.api_set_push_pref(jsonb) to authenticated;

notify pgrst, 'reload schema';
