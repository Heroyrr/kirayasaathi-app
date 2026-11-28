-- =====================================================================
-- PART 22: RAZORPAY PLAN PAYMENTS
--   App  -> api_plan_checkout()  -> makes a one-time pay link token
--   Web  -> /pay?t=TOKEN         -> Razorpay Checkout (website server uses the service_role key)
--   Web  -> plan_order_paid()    -> extends the owner's plan (only after the signature is verified)
-- Run once in Supabase > SQL Editor AFTER 19 and 20. Safe to run again.
-- =====================================================================

-- ---------- 1. every payment attempt ----------
create table if not exists public.plan_orders (
  id                   uuid primary key default gen_random_uuid(),
  token                text not null unique
                         default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  user_id              bigint not null references public.users(id) on delete cascade,
  plan                 text   not null references public.plans(id),
  cycle                text   not null check (cycle in ('m','y')),
  amount_paise         int    not null check (amount_paise > 0),      -- price in paise, copied from the plans table
  status               text   not null default 'created' check (status in ('created','paid','failed','expired')),
  razorpay_order_id    text unique,
  razorpay_payment_id  text unique,
  expires_at           timestamptz not null default now() + interval '2 hours',   -- the pay LINK lives 2 hours
  paid_at              timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists plan_orders_user_idx on public.plan_orders(user_id, created_at desc);
alter table public.plan_orders enable row level security;
revoke all on public.plan_orders from anon, authenticated;     -- only the website server (service_role) and the functions below touch it

-- ---------- 2. the app asks for a pay link ----------
-- body: { "plan": "starter", "cycle": "m" | "y" }  ->  { token, amount }
-- The PRICE always comes from the plans table here. The app can never choose the amount.
create or replace function public.api_plan_checkout(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid bigint := public._uid();
  v_plan plans;
  v_cycle text := case when p->>'cycle' = 'y' then 'y' else 'm' end;
  v_rupees int; v_token text;
begin
  select * into v_plan from plans where id = p->>'plan' and active;
  if not found or v_plan.monthly <= 0 then
    perform public._err('PLAN_UNKNOWN', 'This plan is not available. Please pick another plan.');
  end if;

  v_rupees := case when v_cycle = 'y' then v_plan.yearly else v_plan.monthly end;
  if v_rupees <= 0 then perform public._err('PLAN_UNKNOWN', 'This plan is not available. Please pick another plan.'); end if;

  -- the owner already uses more than this plan allows -> do not take money for a plan that cannot fit
  if public._used_units(v_uid) > v_plan.units
     or (v_plan.properties is not null and (select count(*) from properties where user_id = v_uid) > v_plan.properties) then
    perform public._err('PLAN_TOO_SMALL', 'You already use more units or properties than this plan allows. Pick a bigger plan.');
  end if;

  -- old unpaid links of this owner are no longer needed (a late payment on them is still accepted, see plan_order_paid)
  update plan_orders set status = 'expired' where user_id = v_uid and status = 'created';

  insert into plan_orders(user_id, plan, cycle, amount_paise)
  values (v_uid, v_plan.id, v_cycle, v_rupees * 100)
  returning token into v_token;

  return jsonb_build_object('token', v_token, 'amount', v_rupees, 'plan', v_plan.id, 'cycle', v_cycle);
end $$;
revoke all on function public.api_plan_checkout(jsonb) from public, anon;
grant execute on function public.api_plan_checkout(jsonb) to authenticated;

-- ---------- 3. payment is confirmed -> activate / extend the plan ----------
-- Called ONLY by the website server (service_role) after it verified the Razorpay signature or webhook.
-- Safe to call twice (the checkout page AND the webhook both call it): the second call changes nothing.
-- Money already taken is never refused: even if the link had expired, the plan is still given.
create or replace function public.plan_order_paid(p_razorpay_order_id text, p_razorpay_payment_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o plan_orders; s subscriptions; v_start timestamptz; v_end timestamptz;
begin
  select * into o from plan_orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Unknown Razorpay order %', p_razorpay_order_id; end if;

  if o.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'plan', o.plan, 'order_id', o.id);
  end if;

  update plan_orders set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, paid_at = now() where id = o.id;

  select * into s from subscriptions where user_id = o.user_id;
  -- Same plan still running -> add the new period AFTER the current end (renewal, nothing is lost).
  -- Free trial or a different plan -> the new period starts now.
  v_start := case when found and s.plan = o.plan and s.ends_at > now() then s.ends_at else now() end;
  v_end   := v_start + make_interval(days => case when o.cycle = 'y' then 365 else 30 end);

  insert into subscriptions(user_id, plan, cycle, ends_at) values (o.user_id, o.plan, o.cycle, v_end)
  on conflict (user_id) do update set plan = excluded.plan, cycle = excluded.cycle, ends_at = excluded.ends_at;
  -- (the trigger from part 20 now brings the owner's paused live properties back online by itself)

  return jsonb_build_object('ok', true, 'already', false, 'plan', o.plan, 'ends_at', v_end, 'order_id', o.id);
end $$;
revoke all on function public.plan_order_paid(text, text) from public, anon, authenticated;
grant execute on function public.plan_order_paid(text, text) to service_role;

-- ---------- 4. the website server reads / writes plan_orders with the service_role key ----------
grant select, update on public.plan_orders to service_role;

notify pgrst, 'reload schema';

-- ---------- checks (run when you like) ----------
--   select o.created_at, u.name, u.phone, o.plan, o.cycle, o.amount_paise/100 as rupees, o.status, o.razorpay_payment_id
--     from plan_orders o join users u on u.id = o.user_id order by o.created_at desc limit 20;      -- every attempt
--   select sum(amount_paise)/100 as rupees_received from plan_orders where status = 'paid';            -- money in
