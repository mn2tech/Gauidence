-- Expand billing plans: free | personal | family | business
-- Run in the Supabase SQL Editor after deploy.

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'personal', 'family', 'business'));
