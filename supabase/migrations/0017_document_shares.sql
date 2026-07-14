-- Document sharing: opaque token links with expiry and revoke.
-- Public readers never use this table via anon RLS; API uses service role after token checks.

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  include_file boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists document_shares_document_idx
  on public.document_shares (document_id);

create index if not exists document_shares_owner_idx
  on public.document_shares (user_id);

create unique index if not exists document_shares_token_idx
  on public.document_shares (token);

alter table public.document_shares enable row level security;

create policy "Owners can view own document shares"
  on public.document_shares for select
  using (
    auth.uid() = user_id
    and public.owns_guardian_profile(profile_id)
  );

create policy "Owners can insert own document shares"
  on public.document_shares for insert
  with check (
    auth.uid() = user_id
    and public.owns_guardian_profile(profile_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id
        and d.user_id = auth.uid()
        and d.profile_id = profile_id
    )
  );

create policy "Owners can update own document shares"
  on public.document_shares for update
  using (
    auth.uid() = user_id
    and public.owns_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = user_id
    and public.owns_guardian_profile(profile_id)
  );

create policy "Owners can delete own document shares"
  on public.document_shares for delete
  using (
    auth.uid() = user_id
    and public.owns_guardian_profile(profile_id)
  );
