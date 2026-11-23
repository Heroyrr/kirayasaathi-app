-- =====================================================================
-- OWNER APP (KirayaSaathi)  |  PART 12: update check (app_config)
-- Run once in Supabase > SQL Editor. Safe to run again.
-- The app reads ONE row when it opens and compares its own version with it:
--   older than latest_version -> "Update available" banner on Home
--   older than min_version    -> full screen that blocks the app until the owner updates
-- =====================================================================

create table if not exists public.app_config (
  id              int primary key default 1 check (id = 1),   -- always exactly one row
  latest_version  text not null default '1.0.0',
  min_version     text not null default '1.0.0',
  apk_url         text,                                        -- where the owner downloads the new APK
  message_en      text,
  message_hi      text,
  updated_at      timestamptz not null default now()
);
insert into public.app_config(id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- the app calls this (logged-in owners only)
create or replace function public.api_app_config(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'latest_version', c.latest_version,
    'min_version',    c.min_version,
    'apk_url',        c.apk_url,
    'message_en',     c.message_en,
    'message_hi',     c.message_hi)
  from public.app_config c where c.id = 1
$$;
revoke all on function public.api_app_config(jsonb) from public, anon;
grant execute on function public.api_app_config(jsonb) to authenticated;

-- ADMIN HELPER (SQL Editor only). To release an update: build the APK, upload it, then run for example:
--   select admin_set_app_version('1.0.3', '1.0.0', 'https://your-link/KirayaSaathi-1.0.3.apk',
--                                'A new version is ready with bug fixes.', 'बग फिक्स के साथ नया वर्शन तैयार है।');
-- To FORCE everyone to update, raise the second value (min_version) as well:
--   select admin_set_app_version('1.0.3', '1.0.3', 'https://your-link/KirayaSaathi-1.0.3.apk');
create or replace function public.admin_set_app_version(
  p_latest text, p_min text default null, p_apk_url text default null,
  p_msg_en text default null, p_msg_hi text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_latest !~ '^\d+(\.\d+){0,2}$' or (p_min is not null and p_min !~ '^\d+(\.\d+){0,2}$') then
    raise exception 'Versions look like 1.0.3';
  end if;
  update app_config set
    latest_version = p_latest,
    min_version    = coalesce(p_min, min_version),
    apk_url        = coalesce(p_apk_url, apk_url),
    message_en     = coalesce(p_msg_en, message_en),
    message_hi     = coalesce(p_msg_hi, message_hi),
    updated_at     = now()
  where id = 1;
  return format('latest %s, minimum %s', p_latest, (select min_version from app_config where id = 1));
end $$;
revoke all on function public.admin_set_app_version(text, text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
