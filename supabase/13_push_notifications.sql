-- =====================================================================
-- OWNER APP (KirayaSaathi)  |  PART 13: push tokens + "new lead" notification
-- Run once in Supabase > SQL Editor AFTER 12. Safe to run again.
--
-- BEFORE running this file do these two things (see docs/FIREBASE_PUSH_SETUP.md, part C):
--   1. Database > Extensions: turn ON  pg_net  and  supabase_vault
--   2. Run the two create_secret lines at the bottom of this comment ONCE (use your own values):
--        select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push', 'push_function_url');
--        select vault.create_secret('A-LONG-RANDOM-STRING', 'push_webhook_secret');
--      The same random string must be set as the PUSH_WEBHOOK_SECRET secret of the Edge Function.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------- 1. one row per phone that is logged in ----------
create table if not exists public.push_tokens (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users(id) on delete cascade,
  token       text not null unique,                 -- ExponentPushToken[...]
  platform    text not null default 'android',
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- the app saves its token after login. If the same phone is used by another owner later, the token moves to that owner.
create or replace function public.api_register_push_token(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_tok text := trim(coalesce(p->>'token', ''));
        v_plat text := case when p->>'platform' in ('android', 'ios') then p->>'platform' else 'android' end;
begin
  if v_tok !~ '^Expo(nent)?PushToken\[.+\]$' then
    perform public._err('E_VALIDATION', 'Invalid push token.');
  end if;
  insert into push_tokens(user_id, token, platform) values (v_uid, v_tok, v_plat)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- the app removes its token on logout
create or replace function public.api_remove_push_token(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  delete from push_tokens where user_id = v_uid and token = trim(coalesce(p->>'token', ''));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 2. send a push: asks the Edge Function "send-push" (runs after the transaction commits) ----------
-- p_user_ids = owners to notify. It never raises an error, so a push problem can never break the real action.
create or replace function public._push_send(p_user_ids bigint[], p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_secret text;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then return; end if;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url'  limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_url is null or v_secret is null then
    raise warning 'push not sent: add push_function_url and push_webhook_secret to Vault (see 13_push_notifications.sql)';
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'data', coalesce(p_data, '{}'::jsonb))
  );
exception when others then
  raise warning 'push not sent: %', sqlerrm;
end $$;

-- ---------- 3. new lead from the RoomIndeed website -> push to that owner ----------
-- Only rows with source = 'roomindeed' notify (see api_public_enquiry in 09). Leads added inside the app have source = 'app' and stay silent.
create or replace function public._lead_push_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source = 'roomindeed' then
    perform public._push_send(
      array[new.user_id],
      'New lead from KirayaSaathi',
      'Name: ' || new.name || ', Number: ' || coalesce(new.phone, ''),
      jsonb_build_object('type', 'lead', 'lead_id', new.id, 'url', '/leads/' || new.id));
  end if;
  return new;
exception when others then
  raise warning 'lead push failed: %', sqlerrm;
  return new;      -- the lead is always saved
end $$;

drop trigger if exists leads_push_after_insert on public.leads;
create trigger leads_push_after_insert after insert on public.leads
  for each row execute function public._lead_push_trigger();

-- ---------- 4. permissions ----------
revoke all on function public._push_send(bigint[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public._lead_push_trigger() from public, anon, authenticated;
revoke all on function public.api_register_push_token(jsonb) from public, anon;
revoke all on function public.api_remove_push_token(jsonb) from public, anon;
grant execute on function public.api_register_push_token(jsonb) to authenticated;
grant execute on function public.api_remove_push_token(jsonb) to authenticated;

notify pgrst, 'reload schema';
