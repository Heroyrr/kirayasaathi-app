-- Free plan (trial) limits: 1 property and 10 units.
-- Before this, 'trial' fell into the "else null" branch for properties = UNLIMITED properties, and had 25 units.
-- Run once in Supabase > SQL Editor. Safe to run again.
-- Owners who already have more than this keep what they have; they just cannot add more until they upgrade.
create or replace function public._limits(plan text, out unit_limit int, out property_limit int)
language sql immutable as $$
  select case plan when 'trial' then 10 when 'basic' then 10 when 'starter' then 25
                   when 'growth' then 60 when 'pro' then 150 else 0 end,
         case plan when 'trial' then 1 when 'basic' then 1 when 'starter' then 2
                   when 'growth' then 5 else null end
$$;
