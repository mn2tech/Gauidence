-- Sprint 12: AI Auto-Organization — suggestions, preferences, audit, settings.

-- ---------------------------------------------------------------------------
-- Account preferences for auto-organization
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists auto_organize_mode text not null default 'suggest'
    check (auto_organize_mode in ('off', 'suggest', 'auto')),
  add column if not exists auto_organize_threshold numeric not null default 0.85
    check (auto_organize_threshold >= 0 and auto_organize_threshold <= 1),
  add column if not exists unorganized_profile_id uuid
    references public.guardian_profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Richer extracted metadata (reuses extracted_data instead of document_analysis)
-- ---------------------------------------------------------------------------
alter table public.extracted_data
  add column if not exists entities jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists suggested_questions jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Organization suggestions (pending user approval)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  current_profile_id uuid references public.guardian_profiles (id) on delete set null,
  current_vault_id uuid references public.guardian_profiles (id) on delete set null,
  suggested_profile_id uuid references public.guardian_profiles (id) on delete set null,
  suggested_profile_name text,
  suggested_vault_id uuid references public.guardian_profiles (id) on delete set null,
  suggested_vault_name text,
  document_type text,
  reason text,
  confidence numeric not null default 0,
  detected_entities jsonb not null default '{}'::jsonb,
  suggested_tags jsonb not null default '[]'::jsonb,
  recommended_action text not null default 'keep_current'
    check (recommended_action in (
      'save_to_existing',
      'create_vault',
      'create_profile_and_vault',
      'keep_current',
      'unorganized'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'modified', 'expired')),
  accepted_action text,
  previous_profile_id uuid references public.guardian_profiles (id) on delete set null,
  previous_vault_id uuid references public.guardian_profiles (id) on delete set null,
  created_profile_id uuid references public.guardian_profiles (id) on delete set null,
  created_vault_id uuid references public.guardian_profiles (id) on delete set null,
  duplicate_warning text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists organization_suggestions_user_status_idx
  on public.organization_suggestions (user_id, status, created_at desc);

create index if not exists organization_suggestions_document_idx
  on public.organization_suggestions (document_id, created_at desc);

create unique index if not exists organization_suggestions_one_pending_per_doc
  on public.organization_suggestions (document_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Learned preferences per document type
-- ---------------------------------------------------------------------------
create table if not exists public.organization_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_type text not null,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  vault_id uuid references public.guardian_profiles (id) on delete set null,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  last_selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_preferences_user_doctype_idx
  on public.organization_preferences (user_id, document_type);

-- ---------------------------------------------------------------------------
-- Audit trail for organization decisions
-- ---------------------------------------------------------------------------
create table if not exists public.organization_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  suggestion_id uuid references public.organization_suggestions (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_audit_log_user_idx
  on public.organization_audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organization_suggestions enable row level security;
alter table public.organization_preferences enable row level security;
alter table public.organization_audit_log enable row level security;

create or replace function public.can_access_organization_suggestion(suggestion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_suggestions os
    where os.id = suggestion_id
      and os.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_suggestions os
    where os.id = suggestion_id
      and (
        (os.current_profile_id is not null
          and public.can_access_guardian_profile(os.current_profile_id))
        or (os.suggested_profile_id is not null
          and public.can_access_guardian_profile(os.suggested_profile_id))
        or (os.suggested_vault_id is not null
          and public.can_access_guardian_profile(os.suggested_vault_id))
        or (os.current_vault_id is not null
          and public.can_access_guardian_profile(os.current_vault_id))
      )
  );
$$;

create policy "Users can view own organization suggestions"
  on public.organization_suggestions for select
  using (
    user_id = auth.uid()
    or public.can_access_organization_suggestion(id)
  );

create policy "Users can insert own organization suggestions"
  on public.organization_suggestions for insert
  with check (
    user_id = auth.uid()
    and (
      current_profile_id is null
      or public.can_edit_guardian_profile(current_profile_id)
    )
  );

create policy "Users can update own organization suggestions"
  on public.organization_suggestions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own organization suggestions"
  on public.organization_suggestions for delete
  using (user_id = auth.uid());

create policy "Users can view own organization preferences"
  on public.organization_preferences for select
  using (user_id = auth.uid());

create policy "Users can insert own organization preferences"
  on public.organization_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update own organization preferences"
  on public.organization_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own organization preferences"
  on public.organization_preferences for delete
  using (user_id = auth.uid());

create policy "Users can view own organization audit log"
  on public.organization_audit_log for select
  using (user_id = auth.uid());

create policy "Users can insert own organization audit log"
  on public.organization_audit_log for insert
  with check (user_id = auth.uid());
