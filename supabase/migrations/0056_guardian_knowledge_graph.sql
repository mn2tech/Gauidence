-- Guardian Knowledge Graph: persisted entities, relationships, workspace timeline, proactive suggestions.

create table if not exists public.guardian_knowledge_entities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  entity_type text not null,
  name text not null,
  normalized_name text not null,
  source_type text not null,
  source_id text not null,
  confidence real,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardian_knowledge_entities_dedup_idx
  on public.guardian_knowledge_entities (
    owner_user_id,
    profile_id,
    entity_type,
    normalized_name
  );

create index if not exists guardian_knowledge_entities_profile_idx
  on public.guardian_knowledge_entities (profile_id, updated_at desc);

create table if not exists public.guardian_knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  subject text not null,
  relationship text not null,
  object text not null,
  normalized_key text not null,
  source_type text not null,
  source_id text not null,
  confidence real,
  created_at timestamptz not null default now()
);

create unique index if not exists guardian_knowledge_relationships_dedup_idx
  on public.guardian_knowledge_relationships (
    owner_user_id,
    profile_id,
    normalized_key
  );

create table if not exists public.guardian_workspace_timeline (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  title text not null,
  event_date date,
  category text,
  source_type text not null,
  source_id text not null,
  normalized_key text not null,
  confidence real,
  created_at timestamptz not null default now()
);

create unique index if not exists guardian_workspace_timeline_dedup_idx
  on public.guardian_workspace_timeline (
    owner_user_id,
    profile_id,
    normalized_key
  );

create index if not exists guardian_workspace_timeline_profile_date_idx
  on public.guardian_workspace_timeline (profile_id, event_date desc nulls last, created_at desc);

create table if not exists public.guardian_proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.guardian_profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  priority smallint not null default 50,
  status text not null default 'pending'
    check (status in ('pending', 'dismissed', 'done')),
  due_date date,
  source_type text,
  source_id text,
  normalized_key text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardian_proactive_suggestions_dedup_idx
  on public.guardian_proactive_suggestions (owner_user_id, normalized_key);

create index if not exists guardian_proactive_suggestions_owner_status_idx
  on public.guardian_proactive_suggestions (
    owner_user_id,
    status,
    priority desc,
    created_at desc
  );

alter table public.guardian_knowledge_entities enable row level security;
alter table public.guardian_knowledge_relationships enable row level security;
alter table public.guardian_workspace_timeline enable row level security;
alter table public.guardian_proactive_suggestions enable row level security;

create policy "Users can view own knowledge entities"
  on public.guardian_knowledge_entities for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own knowledge entities"
  on public.guardian_knowledge_entities for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can update own knowledge entities"
  on public.guardian_knowledge_entities for update
  using (auth.uid() = owner_user_id);

create policy "Users can view own knowledge relationships"
  on public.guardian_knowledge_relationships for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own knowledge relationships"
  on public.guardian_knowledge_relationships for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can view own workspace timeline"
  on public.guardian_workspace_timeline for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own workspace timeline"
  on public.guardian_workspace_timeline for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can view own proactive suggestions"
  on public.guardian_proactive_suggestions for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own proactive suggestions"
  on public.guardian_proactive_suggestions for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can update own proactive suggestions"
  on public.guardian_proactive_suggestions for update
  using (auth.uid() = owner_user_id);
