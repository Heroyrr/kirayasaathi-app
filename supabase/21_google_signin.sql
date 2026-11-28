-- =====================================================================
-- PART 21: Google sign-in. A new owner who signs in with Google gets an owner profile and the FREE PLAN
--          (plan 'trial' = 30 days, 1 property, 10 units) automatically, on the first login.
-- Run once in Supabase > SQL Editor. Safe to run again.
-- (Needs 07_email_admin.sql / schema.sql already run: the users.email column and subscriptions table.)
-- =====================================================================

create or replace function public.api_bootstrap(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid(); v_u users; v_phone text; v_email text; v_meta jsonb;
  v_confirmed timestamptz; v_name text := trim(coalesce(p->>'name', ''));
begin
  if v_auth is null then perform public._err('UNAUTH', 'Please log in again.', 401); end if;

  select * into v_u from users where auth_id = v_auth;
  if found then
    if v_u.disabled_at is not null then perform public._err('ACCOUNT_DISABLED', 'Your account is turned off. Please contact support.', 403); end if;
    if v_u.email is null then
      update users set email = (select lower(nullif(email, '')) from auth.users where id = v_auth) where id = v_u.id returning * into v_u;
    end if;
  else
    select nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), ''), lower(nullif(email, '')), raw_user_meta_data, email_confirmed_at
      into v_phone, v_email, v_meta, v_confirmed from auth.users where id = v_auth;
    if v_phone is null and v_email like 'owner.test.8299843647@%' then v_phone := '8299843647'; end if;

    -- Same verified email, but the old login was deleted and made again (new auth id): attach the old profile to the new login
    -- instead of failing on the unique email. Only when the old auth user no longer exists.
    if v_email is not null and v_confirmed is not null then
      select * into v_u from users u
       where lower(u.email) = v_email and not exists (select 1 from auth.users a where a.id = u.auth_id);
      if found then
        update users set auth_id = v_auth where id = v_u.id returning * into v_u;
        if v_u.disabled_at is not null then perform public._err('ACCOUNT_DISABLED', 'Your account is turned off. Please contact support.', 403); end if;
        return jsonb_build_object('user', public._user_json(v_u), 'subscription', public._sub(v_u.id));
      end if;
    end if;

    -- name: typed by the owner, else Google's full name, else the part of the email before the @
    if v_name = '' then
      v_name := coalesce(nullif(trim(v_meta->>'full_name'), ''), nullif(trim(v_meta->>'name'), ''),
                         initcap(replace(split_part(coalesce(v_email, ''), '@', 1), '.', ' ')));
    end if;
    if v_name = '' and v_phone = '8299843647' then v_name := 'Test Owner'; end if;
    if length(coalesce(v_name, '')) < 2 then perform public._err('NAME_REQUIRED', 'Please enter your name.'); end if;

    insert into users(auth_id, name, phone, email) values (v_auth, v_name, v_phone, v_email) returning * into v_u;
    -- the free plan
    insert into subscriptions(user_id, plan, ends_at) values (v_u.id, 'trial', now() + interval '30 days')
    on conflict (user_id) do nothing;
  end if;

  return jsonb_build_object('user', public._user_json(v_u), 'subscription', public._sub(v_u.id));
end $$;

-- ---------- check (run after your first Google login) ----------
--   select u.id, u.name, u.email, s.plan, s.ends_at
--     from users u left join subscriptions s on s.user_id = u.id order by u.id desc limit 5;
