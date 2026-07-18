-- Shared Vault Editors: memberships, invitations, membership-aware RLS.
-- Safe to re-run. Apply in Supabase SQL Editor before deploying app code.
--
-- Scope: Editor collaborators on business/client vaults (exact vault only).
-- Gideon chats remain private per user. Vault documents/logs/alerts are shared.

-- ---------------------------------------------------------------------------
-- 1. Memberships
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_profile_members (
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    check (role in ('owner', 'editor')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, user_id)
);

create index if not exists guardian_profile_members_user_idx
  on public.guardian_profile_members (user_id);

create unique index if not exists guardian_profile_members_one_owner
  on public.guardian_profile_members (profile_id)
  where role = 'owner';

alter table public.guardian_profile_members enable row level security;

-- Backfill owners (idempotent)
insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
select gp.id, gp.owner_user_id, 'owner', gp.owner_user_id
from public.guardian_profiles gp
on conflict (profile_id, user_id) do nothing;

-- Keep owner membership in sync when a vault is created
create or replace function public.guardian_profiles_ensure_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
  values (new.id, new.owner_user_id, 'owner', new.owner_user_id)
  on conflict (profile_id, user_id) do update
    set role = 'owner';
  return new;
end;
$$;

drop trigger if exists guardian_profiles_ensure_owner_member on public.guardian_profiles;
create trigger guardian_profiles_ensure_owner_member
  after insert on public.guardian_profiles
  for each row
  execute function public.guardian_profiles_ensure_owner_member();

-- ---------------------------------------------------------------------------
-- 2. Invitations
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_profile_invitations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  invited_email_normalized text not null,
  role text not null default 'editor'
    check (role in ('editor')),
  token_hash text not null unique,
  invited_by_user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guardian_profile_invitations_profile_idx
  on public.guardian_profile_invitations (profile_id, created_at desc);

create unique index if not exists guardian_profile_invitations_pending_email
  on public.guardian_profile_invitations (profile_id, invited_email_normalized)
  where accepted_at is null and revoked_at is null;

alter table public.guardian_profile_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Capability helpers (SECURITY DEFINER, non-recursive via members table)
-- ---------------------------------------------------------------------------
create or replace function public.guardian_profile_role(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.guardian_profile_members m
  where m.profile_id = p_profile_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_access_guardian_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profile_members m
    where m.profile_id = p_profile_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_guardian_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profile_members m
    where m.profile_id = p_profile_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.can_manage_guardian_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profile_members m
    where m.profile_id = p_profile_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- Keep owns_guardian_profile as owner-only (manage / destructive).
create or replace function public.owns_guardian_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_guardian_profile(p_profile_id);
$$;

revoke all on function public.guardian_profile_role(uuid) from public;
revoke all on function public.can_access_guardian_profile(uuid) from public;
revoke all on function public.can_edit_guardian_profile(uuid) from public;
revoke all on function public.can_manage_guardian_profile(uuid) from public;
revoke all on function public.owns_guardian_profile(uuid) from public;

grant execute on function public.guardian_profile_role(uuid) to authenticated;
grant execute on function public.can_access_guardian_profile(uuid) to authenticated;
grant execute on function public.can_edit_guardian_profile(uuid) to authenticated;
grant execute on function public.can_manage_guardian_profile(uuid) to authenticated;
grant execute on function public.owns_guardian_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Members / invitations RLS
-- ---------------------------------------------------------------------------
drop policy if exists "Members can view memberships" on public.guardian_profile_members;
drop policy if exists "Owners can insert memberships" on public.guardian_profile_members;
drop policy if exists "Owners can update memberships" on public.guardian_profile_members;
drop policy if exists "Owners can delete memberships" on public.guardian_profile_members;
drop policy if exists "Members can leave" on public.guardian_profile_members;

create policy "Members can view memberships"
  on public.guardian_profile_members for select
  using (
    user_id = auth.uid()
    or public.can_access_guardian_profile(profile_id)
  );

create policy "Owners can insert memberships"
  on public.guardian_profile_members for insert
  with check (
    public.can_manage_guardian_profile(profile_id)
    and role = 'editor'
  );

create or replace function public.is_guardian_profile_owner(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profiles gp
    where gp.id = p_profile_id
      and gp.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_guardian_profile_owner(uuid) from public;
grant execute on function public.is_guardian_profile_owner(uuid) to authenticated;

create policy "Owners can insert own owner membership"
  on public.guardian_profile_members for insert
  with check (
    role = 'owner'
    and user_id = auth.uid()
    and public.is_guardian_profile_owner(profile_id)
  );

create policy "Owners can update memberships"
  on public.guardian_profile_members for update
  using (
    public.can_manage_guardian_profile(profile_id)
    and role = 'editor'
  )
  with check (
    public.can_manage_guardian_profile(profile_id)
    and role = 'editor'
  );

create policy "Owners can delete editor memberships"
  on public.guardian_profile_members for delete
  using (
    role = 'editor'
    and (
      public.can_manage_guardian_profile(profile_id)
      or user_id = auth.uid()
    )
  );

drop policy if exists "Owners can view invitations" on public.guardian_profile_invitations;
drop policy if exists "Owners can insert invitations" on public.guardian_profile_invitations;
drop policy if exists "Owners can update invitations" on public.guardian_profile_invitations;
drop policy if exists "Owners can delete invitations" on public.guardian_profile_invitations;

create policy "Owners can view invitations"
  on public.guardian_profile_invitations for select
  using (public.can_manage_guardian_profile(profile_id));

create policy "Owners can insert invitations"
  on public.guardian_profile_invitations for insert
  with check (
    public.can_manage_guardian_profile(profile_id)
    and invited_by_user_id = auth.uid()
  );

create policy "Owners can update invitations"
  on public.guardian_profile_invitations for update
  using (public.can_manage_guardian_profile(profile_id))
  with check (public.can_manage_guardian_profile(profile_id));

create policy "Owners can delete invitations"
  on public.guardian_profile_invitations for delete
  using (public.can_manage_guardian_profile(profile_id));

-- ---------------------------------------------------------------------------
-- 5. Guardian profiles: members can read; owners manage
-- ---------------------------------------------------------------------------
drop policy if exists "Owners can view own guardian profiles" on public.guardian_profiles;
drop policy if exists "Owners can insert own guardian profiles" on public.guardian_profiles;
drop policy if exists "Owners can update own guardian profiles" on public.guardian_profiles;
drop policy if exists "Owners can delete own guardian profiles" on public.guardian_profiles;
drop policy if exists "Members can view accessible guardian profiles" on public.guardian_profiles;

create policy "Members can view accessible guardian profiles"
  on public.guardian_profiles for select
  using (public.can_access_guardian_profile(id));

create policy "Owners can insert own guardian profiles"
  on public.guardian_profiles for insert
  with check (auth.uid() = owner_user_id);

create policy "Owners can update own guardian profiles"
  on public.guardian_profiles for update
  using (public.can_manage_guardian_profile(id))
  with check (public.can_manage_guardian_profile(id) and auth.uid() = owner_user_id);

create policy "Owners can delete own guardian profiles"
  on public.guardian_profiles for delete
  using (public.can_manage_guardian_profile(id));

-- ---------------------------------------------------------------------------
-- 6. Shared vault content (documents, analysis, alerts, chunks, logs)
--    user_id remains creator/audit; authorization is profile membership.
-- ---------------------------------------------------------------------------

-- documents
drop policy if exists "Users can view own documents" on public.documents;
drop policy if exists "Users can insert own documents" on public.documents;
drop policy if exists "Users can update own documents" on public.documents;
drop policy if exists "Users can delete own documents" on public.documents;

create policy "Members can view vault documents"
  on public.documents for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert vault documents"
  on public.documents for insert
  with check (
    auth.uid() = user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update vault documents"
  on public.documents for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

create policy "Editors can delete vault documents"
  on public.documents for delete
  using (public.can_edit_guardian_profile(profile_id));

-- extracted_data
drop policy if exists "Users can view own extracted data" on public.extracted_data;
drop policy if exists "Users can insert own extracted data" on public.extracted_data;
drop policy if exists "Users can update own extracted data" on public.extracted_data;
drop policy if exists "Users can delete own extracted data" on public.extracted_data;

create policy "Members can view vault extracted data"
  on public.extracted_data for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert vault extracted data"
  on public.extracted_data for insert
  with check (
    auth.uid() = user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update vault extracted data"
  on public.extracted_data for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

create policy "Editors can delete vault extracted data"
  on public.extracted_data for delete
  using (public.can_edit_guardian_profile(profile_id));

-- alerts
drop policy if exists "Users can view own alerts" on public.alerts;
drop policy if exists "Users can insert own alerts" on public.alerts;
drop policy if exists "Users can update own alerts" on public.alerts;
drop policy if exists "Users can delete own alerts" on public.alerts;

create policy "Members can view vault alerts"
  on public.alerts for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert vault alerts"
  on public.alerts for insert
  with check (
    auth.uid() = user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update vault alerts"
  on public.alerts for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

create policy "Editors can delete vault alerts"
  on public.alerts for delete
  using (public.can_edit_guardian_profile(profile_id));

-- document_chunks
drop policy if exists "Users can view own document chunks" on public.document_chunks;
drop policy if exists "Users can insert own document chunks" on public.document_chunks;
drop policy if exists "Users can update own document chunks" on public.document_chunks;
drop policy if exists "Users can delete own document chunks" on public.document_chunks;

create policy "Members can view vault document chunks"
  on public.document_chunks for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert vault document chunks"
  on public.document_chunks for insert
  with check (
    auth.uid() = user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update vault document chunks"
  on public.document_chunks for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

create policy "Editors can delete vault document chunks"
  on public.document_chunks for delete
  using (public.can_edit_guardian_profile(profile_id));

-- daily_logs
drop policy if exists "Owners can view own daily logs" on public.daily_logs;
drop policy if exists "Owners can insert own daily logs" on public.daily_logs;
drop policy if exists "Owners can update own daily logs" on public.daily_logs;
drop policy if exists "Owners can delete own daily logs" on public.daily_logs;

create policy "Members can view vault daily logs"
  on public.daily_logs for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert vault daily logs"
  on public.daily_logs for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update vault daily logs"
  on public.daily_logs for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

create policy "Editors can delete vault daily logs"
  on public.daily_logs for delete
  using (public.can_edit_guardian_profile(profile_id));

-- document_shares remain owner-managed
drop policy if exists "Users can view own document shares" on public.document_shares;
drop policy if exists "Users can insert own document shares" on public.document_shares;
drop policy if exists "Users can update own document shares" on public.document_shares;
drop policy if exists "Users can delete own document shares" on public.document_shares;

create policy "Owners can view document shares"
  on public.document_shares for select
  using (
    auth.uid() = user_id
    and public.can_manage_guardian_profile(profile_id)
  );

create policy "Owners can insert document shares"
  on public.document_shares for insert
  with check (
    auth.uid() = user_id
    and public.can_manage_guardian_profile(profile_id)
  );

create policy "Owners can update document shares"
  on public.document_shares for update
  using (
    auth.uid() = user_id
    and public.can_manage_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = user_id
    and public.can_manage_guardian_profile(profile_id)
  );

create policy "Owners can delete document shares"
  on public.document_shares for delete
  using (
    auth.uid() = user_id
    and public.can_manage_guardian_profile(profile_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Private chats (own threads only + vault access)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own vault chat" on public.vault_chats;
drop policy if exists "Users can insert own vault chat" on public.vault_chats;
drop policy if exists "Users can update own vault chat" on public.vault_chats;
drop policy if exists "Users can delete own vault chat" on public.vault_chats;

create policy "Users can view own vault chat"
  on public.vault_chats for select
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can insert own vault chat"
  on public.vault_chats for insert
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can update own vault chat"
  on public.vault_chats for update
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can delete own vault chat"
  on public.vault_chats for delete
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Users can view own document chats" on public.document_chats;
drop policy if exists "Users can insert own document chats" on public.document_chats;
drop policy if exists "Users can update own document chats" on public.document_chats;
drop policy if exists "Users can delete own document chats" on public.document_chats;

create policy "Users can view own document chats"
  on public.document_chats for select
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can insert own document chats"
  on public.document_chats for insert
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can update own document chats"
  on public.document_chats for update
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

create policy "Users can delete own document chats"
  on public.document_chats for delete
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Users can view own vault chat messages" on public.vault_chat_messages;
drop policy if exists "Users can insert own vault chat messages" on public.vault_chat_messages;
drop policy if exists "Users can delete own vault chat messages" on public.vault_chat_messages;

create policy "Users can view own vault chat messages"
  on public.vault_chat_messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.can_access_guardian_profile(vc.profile_id)
    )
  );

create policy "Users can insert own vault chat messages"
  on public.vault_chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.can_access_guardian_profile(vc.profile_id)
    )
  );

create policy "Users can delete own vault chat messages"
  on public.vault_chat_messages for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.can_access_guardian_profile(vc.profile_id)
    )
  );

-- Harden document chat messages through parent chat
drop policy if exists "Users can view own document chat messages" on public.document_chat_messages;
drop policy if exists "Users can insert own document chat messages" on public.document_chat_messages;
drop policy if exists "Users can delete own document chat messages" on public.document_chat_messages;

create policy "Users can view own document chat messages"
  on public.document_chat_messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.document_chats dc
      where dc.id = document_chat_messages.chat_id
        and dc.user_id = auth.uid()
        and public.can_access_guardian_profile(dc.profile_id)
    )
  );

create policy "Users can insert own document chat messages"
  on public.document_chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.document_chats dc
      where dc.id = document_chat_messages.chat_id
        and dc.user_id = auth.uid()
        and public.can_access_guardian_profile(dc.profile_id)
    )
  );

create policy "Users can delete own document chat messages"
  on public.document_chat_messages for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.document_chats dc
      where dc.id = document_chat_messages.chat_id
        and dc.user_id = auth.uid()
        and public.can_access_guardian_profile(dc.profile_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Vector retrieval: membership, not creator user_id
-- ---------------------------------------------------------------------------
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
  where c.profile_id = filter_profile_id
    and public.can_access_guardian_profile(filter_profile_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_document_chunks(vector(1536), int, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Storage: authorize by vault profile_id (path segment 2)
--    Path convention remains {uploader_or_owner}/{profile_id}/{file}
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload own documents" on storage.objects;
drop policy if exists "Users can view own documents" on storage.objects;
drop policy if exists "Users can update own document files" on storage.objects;
drop policy if exists "Users can delete own documents" on storage.objects;
drop policy if exists "Members can upload vault documents" on storage.objects;
drop policy if exists "Members can view vault documents" on storage.objects;
drop policy if exists "Members can update vault documents" on storage.objects;
drop policy if exists "Members can delete vault documents" on storage.objects;

create policy "Members can upload vault documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and public.can_edit_guardian_profile(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Members can view vault documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and public.can_access_guardian_profile(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Members can update vault documents"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and public.can_edit_guardian_profile(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and public.can_edit_guardian_profile(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Members can delete vault documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and public.can_edit_guardian_profile(((storage.foldername(name))[2])::uuid)
      )
    )
  );
