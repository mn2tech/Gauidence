-- Per-user expert access: admins grant which catalog experts a user may see/install.

create table if not exists public.expert_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expert_id text not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, expert_id)
);

create index if not exists expert_entitlements_user_idx
  on public.expert_entitlements (user_id, granted_at desc);

create index if not exists expert_entitlements_expert_idx
  on public.expert_entitlements (expert_id);

-- Backfill from existing installations so current users keep access.
insert into public.expert_entitlements (user_id, expert_id, granted_at)
select distinct user_id, expert_id, installed_at
from public.user_experts
on conflict (user_id, expert_id) do nothing;

alter table public.expert_entitlements enable row level security;

drop policy if exists "Users can view own expert entitlements" on public.expert_entitlements;
create policy "Users can view own expert entitlements"
  on public.expert_entitlements for select
  using (auth.uid() = user_id);
