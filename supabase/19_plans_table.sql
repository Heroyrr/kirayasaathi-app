-- PLANS IN THE DATABASE: change limits / prices / add new plans without an app update.
-- Run once in Supabase > SQL Editor. Safe to run again.

create table if not exists public.plans (
  id          text primary key,                 -- e.g. basic, starter, growth, pro, custom_ramesh
  name        text not null,
  units       int  not null,                    -- unit limit
  properties  int,                              -- property limit, NULL = unlimited
  monthly     int  not null default 0,
  yearly      int  not null default 0,
  why_en      text not null default '',
  why_hi      text not null default '',
  features    jsonb not null default '[]'::jsonb,   -- [{"en":"...","hi":"..."}]
  sort        int  not null default 100,
  active      boolean not null default true,    -- true = shown in the app's plan list
  created_at  timestamptz not null default now()
);
alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;

insert into public.plans(id, name, units, properties, monthly, yearly, why_en, why_hi, features, sort, active) values
 ('trial',  'Free trial', 10, 1,    0,    0, '', '', '[]', 0, false),
 ('basic',  'Basic',   10, 1,    149, 1490, 'Best for a single small property.', 'एक छोटी प्रॉपर्टी के लिए सबसे अच्छा।',
   '[{"en":"Leads: add, follow up, talk history","hi":"लीड: जोड़ें, फॉलो-अप, बातचीत का इतिहास"},{"en":"Tenant e-KYC","hi":"किरायेदार e-KYC"},{"en":"Invoice and receipt share (WhatsApp / PDF)","hi":"इनवॉइस और रसीद शेयर (WhatsApp / PDF)"},{"en":"Rent, payments and balance tracking","hi":"किराया, भुगतान और बैलेंस ट्रैकिंग"}]', 10, true),
 ('starter','Starter', 25, 2,    299, 2990, 'Manage two properties and fill vacant rooms through RoomIndeed.', 'दो प्रॉपर्टी संभालें और RoomIndeed से खाली कमरे भरें।',
   '[{"en":"Leads: add, follow up, talk history","hi":"लीड: जोड़ें, फॉलो-अप, बातचीत का इतिहास"},{"en":"Tenant e-KYC","hi":"किरायेदार e-KYC"},{"en":"Invoice and receipt share (WhatsApp / PDF)","hi":"इनवॉइस और रसीद शेयर (WhatsApp / PDF)"},{"en":"Rent, payments and balance tracking","hi":"किराया, भुगतान और बैलेंस ट्रैकिंग"},{"en":"Electricity meters and readings","hi":"बिजली मीटर और रीडिंग"},{"en":"RoomIndeed live listing (get enquiries)","hi":"RoomIndeed लाइव लिस्टिंग (पूछताछ पाएं)"}]', 20, true),
 ('growth', 'Growth',  60, 5,    599, 5990, 'For growing owners: more rooms, complaints and meters in one place.', 'बढ़ते मालिकों के लिए: ज़्यादा कमरे, शिकायतें और मीटर एक जगह।',
   '[{"en":"Leads: add, follow up, talk history","hi":"लीड: जोड़ें, फॉलो-अप, बातचीत का इतिहास"},{"en":"Tenant e-KYC","hi":"किरायेदार e-KYC"},{"en":"Invoice and receipt share (WhatsApp / PDF)","hi":"इनवॉइस और रसीद शेयर (WhatsApp / PDF)"},{"en":"Rent, payments and balance tracking","hi":"किराया, भुगतान और बैलेंस ट्रैकिंग"},{"en":"Electricity meters and readings","hi":"बिजली मीटर और रीडिंग"},{"en":"Tenant complaints / support","hi":"किरायेदार की शिकायतें / सहायता"},{"en":"RoomIndeed live listing (get enquiries)","hi":"RoomIndeed लाइव लिस्टिंग (पूछताछ पाएं)"}]', 30, true),
 ('pro',    'Pro',    150, null, 999, 9990, 'For large businesses: unlimited properties and priority help.', 'बड़े कारोबार के लिए: असीमित प्रॉपर्टी और प्राथमिकता सहायता।',
   '[{"en":"Leads: add, follow up, talk history","hi":"लीड: जोड़ें, फॉलो-अप, बातचीत का इतिहास"},{"en":"Tenant e-KYC","hi":"किरायेदार e-KYC"},{"en":"Invoice and receipt share (WhatsApp / PDF)","hi":"इनवॉइस और रसीद शेयर (WhatsApp / PDF)"},{"en":"Rent, payments and balance tracking","hi":"किराया, भुगतान और बैलेंस ट्रैकिंग"},{"en":"Electricity meters and readings","hi":"बिजली मीटर और रीडिंग"},{"en":"Tenant complaints / support","hi":"किरायेदार की शिकायतें / सहायता"},{"en":"RoomIndeed live listing (get enquiries)","hi":"RoomIndeed लाइव लिस्टिंग (पूछताछ पाएं)"},{"en":"Priority support","hi":"प्राथमिकता सहायता"}]', 40, true)
on conflict (id) do nothing;

-- subscriptions.plan may now be ANY plan id in the plans table (no more fixed list)
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions drop constraint if exists subscriptions_plan_fkey;
alter table public.subscriptions add constraint subscriptions_plan_fkey
  foreign key (plan) references public.plans(id) on update cascade;

-- limits now come from the table (this is what is enforced)
create or replace function public._limits(plan text, out unit_limit int, out property_limit int)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p.units from plans p where p.id = plan), 0),
         (select p.properties from plans p where p.id = plan)
$$;

-- the app reads the plan list from here
create or replace function public.api_plans(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'units', units, 'properties', properties,
    'monthly', monthly, 'yearly', yearly,
    'why', jsonb_build_object('en', why_en, 'hi', why_hi),
    'features', features) order by sort, id), '[]'::jsonb)
  from plans where active
$$;
revoke all on function public.api_plans(jsonb) from public, anon;
grant execute on function public.api_plans(jsonb) to authenticated;

-- admin_set_plan: accept any plan in the table
create or replace function public.admin_set_plan(p_email text, p_plan text, p_cycle text default 'm', p_days int default 30) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if not exists (select 1 from plans where id = p_plan) then raise exception 'Unknown plan %', p_plan; end if;
  select id into v_id from users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'No owner with email % (the owner must log in once first)', p_email; end if;
  insert into subscriptions(user_id, plan, cycle, ends_at)
  values (v_id, p_plan, case when p_plan = 'trial' then null else p_cycle end, now() + make_interval(days => p_days))
  on conflict (user_id) do update set plan = excluded.plan, cycle = excluded.cycle, ends_at = excluded.ends_at;
  return format('%s is now on %s until %s', p_email, p_plan, to_char(now() + make_interval(days => p_days), 'DD Mon YYYY'));
end $$;
revoke all on function public.admin_set_plan(text, text, text, int) from public, anon, authenticated;

-- ADD or CHANGE a plan in one line (properties NULL = unlimited; shown = visible in the app list):
--   select admin_upsert_plan('basic', 'Basic', 30, 3, 149, 1490);                     -- units 10->30, properties 1->3 for EVERYONE on Basic
--   select admin_upsert_plan('gold', 'Gold', 100, 10, 799, 7990, 'For big owners', 'बड़े मालिकों के लिए');   -- new plan
--   select admin_upsert_plan('custom_ramesh', 'Custom', 40, 4, 500, 5000, '', '', false);  -- private plan for one owner (hidden), then admin_set_plan(email,'custom_ramesh',...)
create or replace function public.admin_upsert_plan(
  p_id text, p_name text, p_units int, p_properties int, p_monthly int, p_yearly int,
  p_why_en text default null, p_why_hi text default null, p_shown boolean default true) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into plans(id, name, units, properties, monthly, yearly, why_en, why_hi, active, sort)
  values (p_id, p_name, p_units, p_properties, p_monthly, p_yearly, coalesce(p_why_en, ''), coalesce(p_why_hi, ''), p_shown,
          coalesce((select max(sort) from plans), 0) + 10)
  on conflict (id) do update set name = excluded.name, units = excluded.units, properties = excluded.properties,
    monthly = excluded.monthly, yearly = excluded.yearly,
    why_en = coalesce(p_why_en, plans.why_en), why_hi = coalesce(p_why_hi, plans.why_hi), active = excluded.active;
  return format('plan %s: %s units, %s properties', p_id, p_units, coalesce(p_properties::text, 'unlimited'));
end $$;
revoke all on function public.admin_upsert_plan(text, text, int, int, int, int, text, text, boolean) from public, anon, authenticated;
