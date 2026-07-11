-- Optional organization name for invoice payment-direction matching.

alter table public.profiles
  add column if not exists company_name text;
