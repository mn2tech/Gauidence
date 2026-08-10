-- Store structured Gideon opportunity analysis on business leads.

alter table public.business_leads
  add column if not exists opportunity_brief jsonb not null default '{}'::jsonb;
