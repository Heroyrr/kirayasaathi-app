-- =====================================================================
-- OWNER APP (KirayaSaathi)  |  PART 14: notices sent to owners
-- Run once in Supabase > SQL Editor AFTER 13. Safe to run again.
-- Only YOU can send a notice, from the SQL Editor (admin_send_notice). Owners can only read their own.
-- =====================================================================

create table if not exists public.app_notices (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  audience    text not null default 'all' check (audience in ('all', 'list')),
  user_ids    bigint[] not null default '{}',          -- used when audience = 'list'
  screen      text,                                    -- optional screen to open, for example /plans or /leads
  created_at  timestamptz not null default now()
);
alter table public.app_notices enable row level security;
revoke all on public.app_notices from anon, authenticated;

-- the Notices list inside the app
create or replace function public.api_get_notices(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'screen', n.screen, 'created_at', n.created_at)
                     order by n.id desc)
      from (select * from app_notices
             where audience = 'all' or v_uid = any(user_ids)
             order by id desc limit 50) n
  ), '[]'::jsonb);
end $$;
revoke all on function public.api_get_notices(jsonb) from public, anon;
grant execute on function public.api_get_notices(jsonb) to authenticated;

-- ADMIN: send a notice (SQL Editor only)
--   to every owner:       select admin_send_notice('Diwali offer', 'Get 2 months free on yearly plans.');
--   to some owners:       select admin_send_notice('Hello', 'Your plan ends soon.', array['a@x.com','b@y.com']);
--   open a screen on tap: select admin_send_notice('New plans', 'See the new plans.', null, '/plans');
create or replace function public.admin_send_notice(p_title text, p_body text, p_emails text[] default null, p_screen text default null)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids bigint[]; v_nid bigint; v_missing text[]; v_push bigint[];
begin
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Title and message are required'; end if;
  if p_screen is not null and p_screen !~ '^/[A-Za-z0-9/_-]*$' then raise exception 'Screen must look like /plans'; end if;

  if p_emails is null then
    insert into app_notices(title, body, audience, screen) values (trim(p_title), trim(p_body), 'all', p_screen) returning id into v_nid;
    select array_agg(id) into v_push from users where disabled_at is null;
  else
    select array_agg(id) into v_ids from users where lower(email) = any (select lower(trim(e)) from unnest(p_emails) e);
    select array_agg(e) into v_missing from unnest(p_emails) e where lower(trim(e)) not in (select lower(email) from users where email is not null);
    if v_missing is not null then raise exception 'No owner with email: %', array_to_string(v_missing, ', '); end if;
    insert into app_notices(title, body, audience, user_ids, screen) values (trim(p_title), trim(p_body), 'list', v_ids, p_screen) returning id into v_nid;
    select array_agg(id) into v_push from users where id = any(v_ids) and disabled_at is null;
  end if;

  perform public._push_send(v_push, trim(p_title), trim(p_body),
    jsonb_build_object('type', 'notice', 'notice_id', v_nid, 'url', coalesce(p_screen, '/notices')));
  return format('Notice %s saved. Push asked for %s owner(s).', v_nid, coalesce(array_length(v_push, 1), 0));
end $$;
revoke all on function public.admin_send_notice(text, text, text[], text) from public, anon, authenticated;

notify pgrst, 'reload schema';
