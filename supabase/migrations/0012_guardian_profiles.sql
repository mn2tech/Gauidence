-- Sprint 10: Multiple Guardian profiles per account.
-- Account identity stays in public.profiles (id = auth.users.id).
-- Vault contexts live in public.guardian_profiles.
--
-- Rollback sketch (destructive — only if needed before NOT NULL finalized):
--   1. Drop policies/functions added here
--   2. Drop profile_id columns
--   3. Drop guardian_profiles
--   4. Drop profiles.active_guardian_profile_id
-- Prefer restoring from backup for production.

-- ---------------------------------------------------------------------------
-- 1. Guardian profiles (multi-context vaults)
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_type text not null
    check (profile_type in (
      'personal',
      'child',
      'spouse_partner',
      'parent',
      'family_member',
      'student',
      'business',
      'employee',
      'client',
      'other'
    )),
  display_name text not null,
  relationship text,
  avatar_url text,
  date_of_birth date,
  school_name text,
  grade_level text,
  business_legal_name text,
  industry text,
  website text,
  description text,
  job_title text,
  department text,
  organization_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guardian_profiles_owner_idx
  on public.guardian_profiles (owner_user_id);

-- At most one default profile per account
create unique index if not exists guardian_profiles_one_default_per_owner
  on public.guardian_profiles (owner_user_id)
  where is_default = true;

alter table public.guardian_profiles enable row level security;

create policy "Owners can view own guardian profiles"
  on public.guardian_profiles for select
  using (auth.uid() = owner_user_id);

create policy "Owners can insert own guardian profiles"
  on public.guardian_profiles for insert
  with check (auth.uid() = owner_user_id);

create policy "Owners can update own guardian profiles"
  on public.guardian_profiles for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "Owners can delete own guardian profiles"
  on public.guardian_profiles for delete
  using (auth.uid() = owner_user_id);

-- Active profile preference on the account identity row
alter table public.profiles
  add column if not exists active_guardian_profile_id uuid
    references public.guardian_profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Backfill default personal profile for every account
-- ---------------------------------------------------------------------------
insert into public.guardian_profiles (
  owner_user_id,
  profile_type,
  display_name,
  relationship,
  organization_name,
  is_default
)
select
  p.id,
  'personal',
  coalesce(nullif(trim(p.full_name), ''), split_part(coalesce(p.email, 'My'), '@', 1), 'Me'),
  'Myself',
  nullif(trim(p.company_name), ''),
  true
from public.profiles p
where not exists (
  select 1 from public.guardian_profiles gp
  where gp.owner_user_id = p.id and gp.is_default = true
);

update public.profiles p
set active_guardian_profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = p.id
  and gp.is_default = true
  and p.active_guardian_profile_id is null;

-- ---------------------------------------------------------------------------
-- 3. Add nullable profile_id columns + backfill
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

alter table public.extracted_data
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

alter table public.alerts
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

alter table public.document_chunks
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

alter table public.vault_chats
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

alter table public.document_chats
  add column if not exists profile_id uuid references public.guardian_profiles (id) on delete cascade;

-- Backfill from each user's default profile
update public.documents d
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = d.user_id
  and gp.is_default = true
  and d.profile_id is null;

update public.extracted_data e
set profile_id = d.profile_id
from public.documents d
where d.id = e.document_id
  and e.profile_id is null
  and d.profile_id is not null;

update public.extracted_data e
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = e.user_id
  and gp.is_default = true
  and e.profile_id is null;

update public.alerts a
set profile_id = d.profile_id
from public.documents d
where d.id = a.document_id
  and a.profile_id is null
  and d.profile_id is not null;

update public.alerts a
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = a.user_id
  and gp.is_default = true
  and a.profile_id is null;

update public.document_chunks c
set profile_id = d.profile_id
from public.documents d
where d.id = c.document_id
  and c.profile_id is null
  and d.profile_id is not null;

update public.document_chunks c
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = c.user_id
  and gp.is_default = true
  and c.profile_id is null;

update public.vault_chats v
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = v.user_id
  and gp.is_default = true
  and v.profile_id is null;

update public.document_chats dc
set profile_id = d.profile_id
from public.documents d
where d.id = dc.document_id
  and dc.profile_id is null
  and d.profile_id is not null;

update public.document_chats dc
set profile_id = gp.id
from public.guardian_profiles gp
where gp.owner_user_id = dc.user_id
  and gp.is_default = true
  and dc.profile_id is null;

-- ---------------------------------------------------------------------------
-- 4. Enforce NOT NULL after backfill
-- ---------------------------------------------------------------------------
alter table public.documents alter column profile_id set not null;
alter table public.extracted_data alter column profile_id set not null;
alter table public.alerts alter column profile_id set not null;
alter table public.document_chunks alter column profile_id set not null;
alter table public.vault_chats alter column profile_id set not null;
alter table public.document_chats alter column profile_id set not null;

create index if not exists documents_profile_id_idx on public.documents (profile_id);
create index if not exists extracted_data_profile_id_idx on public.extracted_data (profile_id);
create index if not exists alerts_profile_id_idx on public.alerts (profile_id);
create index if not exists document_chunks_profile_id_idx on public.document_chunks (profile_id);
create index if not exists vault_chats_profile_id_idx on public.vault_chats (profile_id);

-- ---------------------------------------------------------------------------
-- 5. Strengthen RLS: owned profile must match
-- ---------------------------------------------------------------------------
create or replace function public.owns_guardian_profile(p_profile_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profiles gp
    where gp.id = p_profile_id
      and gp.owner_user_id = auth.uid()
  );
$$;

grant execute on function public.owns_guardian_profile(uuid) to authenticated;

-- documents
drop policy if exists "Users can view own documents" on public.documents;
drop policy if exists "Users can insert own documents" on public.documents;
drop policy if exists "Users can update own documents" on public.documents;
drop policy if exists "Users can delete own documents" on public.documents;

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- extracted_data
drop policy if exists "Users can view own extracted data" on public.extracted_data;
drop policy if exists "Users can insert own extracted data" on public.extracted_data;
drop policy if exists "Users can update own extracted data" on public.extracted_data;
drop policy if exists "Users can delete own extracted data" on public.extracted_data;

create policy "Users can view own extracted data"
  on public.extracted_data for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own extracted data"
  on public.extracted_data for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own extracted data"
  on public.extracted_data for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own extracted data"
  on public.extracted_data for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- alerts
drop policy if exists "Users can view own alerts" on public.alerts;
drop policy if exists "Users can insert own alerts" on public.alerts;
drop policy if exists "Users can update own alerts" on public.alerts;
drop policy if exists "Users can delete own alerts" on public.alerts;

create policy "Users can view own alerts"
  on public.alerts for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own alerts"
  on public.alerts for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own alerts"
  on public.alerts for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own alerts"
  on public.alerts for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- document_chunks
drop policy if exists "Users can view own document chunks" on public.document_chunks;
drop policy if exists "Users can insert own document chunks" on public.document_chunks;
drop policy if exists "Users can update own document chunks" on public.document_chunks;
drop policy if exists "Users can delete own document chunks" on public.document_chunks;

create policy "Users can view own document chunks"
  on public.document_chunks for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own document chunks"
  on public.document_chunks for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own document chunks"
  on public.document_chunks for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own document chunks"
  on public.document_chunks for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- vault_chats
drop policy if exists "Users can view own vault chat" on public.vault_chats;
drop policy if exists "Users can insert own vault chat" on public.vault_chats;
drop policy if exists "Users can update own vault chat" on public.vault_chats;
drop policy if exists "Users can delete own vault chat" on public.vault_chats;

create policy "Users can view own vault chat"
  on public.vault_chats for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own vault chat"
  on public.vault_chats for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own vault chat"
  on public.vault_chats for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own vault chat"
  on public.vault_chats for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- document_chats
drop policy if exists "Users can view own document chats" on public.document_chats;
drop policy if exists "Users can insert own document chats" on public.document_chats;
drop policy if exists "Users can update own document chats" on public.document_chats;
drop policy if exists "Users can delete own document chats" on public.document_chats;

create policy "Users can view own document chats"
  on public.document_chats for select
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can insert own document chats"
  on public.document_chats for insert
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can update own document chats"
  on public.document_chats for update
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id))
  with check (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

create policy "Users can delete own document chats"
  on public.document_chats for delete
  using (auth.uid() = user_id and public.owns_guardian_profile(profile_id));

-- ---------------------------------------------------------------------------
-- 6. Profile-scoped vault retrieval
-- ---------------------------------------------------------------------------
drop function if exists public.match_document_chunks(vector(1536), int);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_profile_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  file_name text,
  content text,
  chunk_index int,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.file_name,
    c.content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.document_chunks c
  where c.user_id = auth.uid()
    and c.profile_id = filter_profile_id
    and public.owns_guardian_profile(filter_profile_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_document_chunks(vector(1536), int, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Auto-create default guardian profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_gp_id uuid;
  display text;
begin
  display := coalesce(
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''),
    split_part(coalesce(new.email, 'Me'), '@', 1),
    'Me'
  );

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;

  select id into new_gp_id
  from public.guardian_profiles
  where owner_user_id = new.id and is_default = true
  limit 1;

  if new_gp_id is null then
    insert into public.guardian_profiles (
      owner_user_id,
      profile_type,
      display_name,
      relationship,
      is_default
    )
    values (new.id, 'personal', display, 'Myself', true)
    returning id into new_gp_id;
  end if;

  if new_gp_id is not null then
    update public.profiles
    set active_guardian_profile_id = coalesce(active_guardian_profile_id, new_gp_id)
    where id = new.id;
  end if;

  return new;
end;
$$;
