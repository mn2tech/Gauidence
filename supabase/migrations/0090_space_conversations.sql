-- Space Conversations: shared, knowledge-aware discussion per Guardian Space.
-- Spaces are guardian_profiles; profile_id is the Space id.
-- Distinct from private Ask Gideon threads (vault_chats).

-- ---------------------------------------------------------------------------
-- One shared conversation per Space
-- ---------------------------------------------------------------------------
create table if not exists public.space_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.guardian_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists space_conversations_profile_idx
  on public.space_conversations (profile_id);

comment on table public.space_conversations is
  'Shared conversation thread for a Guardian Space (one per profile).';

alter table public.space_conversations enable row level security;

drop policy if exists "Members can view space conversations" on public.space_conversations;
create policy "Members can view space conversations"
  on public.space_conversations for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Members can create space conversations" on public.space_conversations;
create policy "Members can create space conversations"
  on public.space_conversations for insert
  with check (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can update space conversations" on public.space_conversations;
create policy "Editors can update space conversations"
  on public.space_conversations for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Owners can delete space conversations" on public.space_conversations;
create policy "Owners can delete space conversations"
  on public.space_conversations for delete
  using (public.can_manage_guardian_profile(profile_id));

create or replace function public.space_conversations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists space_conversations_updated_at on public.space_conversations;
create trigger space_conversations_updated_at
  before update on public.space_conversations
  for each row execute function public.space_conversations_set_updated_at();

-- ---------------------------------------------------------------------------
-- Messages (members + Gideon)
-- ---------------------------------------------------------------------------
create table if not exists public.space_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.space_conversations (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  sender_user_id uuid references auth.users (id) on delete set null,
  sender_type text not null check (sender_type in ('user', 'gideon')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  suggested_questions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  attached_document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_conversation_messages_content_not_empty
    check (char_length(trim(content)) > 0),
  constraint space_conversation_messages_sender_user_check
    check (
      (sender_type = 'user' and sender_user_id is not null)
      or (sender_type = 'gideon')
    )
);

create index if not exists space_conversation_messages_conversation_idx
  on public.space_conversation_messages (conversation_id, created_at asc);

create index if not exists space_conversation_messages_profile_idx
  on public.space_conversation_messages (profile_id, created_at desc);

comment on table public.space_conversation_messages is
  'Chronological Space Conversation messages from members or Gideon.';

comment on column public.space_conversation_messages.citations is
  'Document / knowledge citations for Gideon answers (never fabricate).';

comment on column public.space_conversation_messages.suggested_questions is
  'Contextual follow-up question chips after a Gideon answer.';

alter table public.space_conversation_messages enable row level security;

drop policy if exists "Members can view space conversation messages" on public.space_conversation_messages;
create policy "Members can view space conversation messages"
  on public.space_conversation_messages for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Members can send space conversation messages" on public.space_conversation_messages;
create policy "Members can send space conversation messages"
  on public.space_conversation_messages for insert
  with check (
    public.can_access_guardian_profile(profile_id)
    and (
      (sender_type = 'user' and sender_user_id = auth.uid())
      or sender_type = 'gideon'
    )
    and exists (
      select 1
      from public.space_conversations c
      where c.id = conversation_id
        and c.profile_id = profile_id
    )
    and (
      attached_document_id is null
      or exists (
        select 1
        from public.documents d
        where d.id = attached_document_id
          and d.profile_id = space_conversation_messages.profile_id
          and public.can_view_vault_document_row(d.profile_id, d.client_visible)
      )
    )
  );

drop policy if exists "Editors can update space conversation messages" on public.space_conversation_messages;
create policy "Editors can update space conversation messages"
  on public.space_conversation_messages for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Authors or owners can delete space conversation messages" on public.space_conversation_messages;
create policy "Authors or owners can delete space conversation messages"
  on public.space_conversation_messages for delete
  using (
    sender_user_id = auth.uid()
    or public.can_manage_guardian_profile(profile_id)
  );

create or replace function public.space_conversation_messages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists space_conversation_messages_updated_at on public.space_conversation_messages;
create trigger space_conversation_messages_updated_at
  before update on public.space_conversation_messages
  for each row execute function public.space_conversation_messages_set_updated_at();

create or replace function public.touch_space_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.space_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists space_conversation_messages_touch_conversation on public.space_conversation_messages;
create trigger space_conversation_messages_touch_conversation
  after insert on public.space_conversation_messages
  for each row execute function public.touch_space_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Durable knowledge promoted from conversation (Decision / Task / Note)
-- ---------------------------------------------------------------------------
create table if not exists public.space_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  kind text not null check (kind in ('decision', 'task', 'note')),
  title text,
  content text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  source_conversation_id uuid references public.space_conversations (id) on delete set null,
  source_message_id uuid references public.space_conversation_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_knowledge_items_content_not_empty
    check (char_length(trim(content)) > 0)
);

create index if not exists space_knowledge_items_profile_kind_idx
  on public.space_knowledge_items (profile_id, kind, created_at desc);

create index if not exists space_knowledge_items_source_message_idx
  on public.space_knowledge_items (source_message_id)
  where source_message_id is not null;

comment on table public.space_knowledge_items is
  'Explicitly promoted Space knowledge (Decision, Task, Note) — not casual chat.';

alter table public.space_knowledge_items enable row level security;

drop policy if exists "Members can view space knowledge items" on public.space_knowledge_items;
create policy "Members can view space knowledge items"
  on public.space_knowledge_items for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can create space knowledge items" on public.space_knowledge_items;
create policy "Editors can create space knowledge items"
  on public.space_knowledge_items for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_guardian_profile(profile_id)
  );

drop policy if exists "Editors can update space knowledge items" on public.space_knowledge_items;
create policy "Editors can update space knowledge items"
  on public.space_knowledge_items for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Owners can delete space knowledge items" on public.space_knowledge_items;
create policy "Owners can delete space knowledge items"
  on public.space_knowledge_items for delete
  using (public.can_manage_guardian_profile(profile_id));

create or replace function public.space_knowledge_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists space_knowledge_items_updated_at on public.space_knowledge_items;
create trigger space_knowledge_items_updated_at
  before update on public.space_knowledge_items
  for each row execute function public.space_knowledge_items_set_updated_at();
