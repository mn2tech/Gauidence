-- Client requests: structured issues/requirements in client vaults with threaded replies.
-- Scoped to client profiles; business owners and vault collaborators can participate.

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint client_requests_title_not_empty check (char_length(trim(title)) > 0),
  constraint client_requests_description_not_empty check (char_length(trim(description)) > 0)
);

create index if not exists client_requests_profile_status_idx
  on public.client_requests (profile_id, status, updated_at desc);

create index if not exists client_requests_created_by_idx
  on public.client_requests (created_by, created_at desc);

alter table public.client_requests enable row level security;

drop policy if exists "Members can view client requests" on public.client_requests;
create policy "Members can view client requests"
  on public.client_requests for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can create client requests" on public.client_requests;
create policy "Editors can create client requests"
  on public.client_requests for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_guardian_profile(profile_id)
  );

drop policy if exists "Members can update client requests" on public.client_requests;
create policy "Members can update client requests"
  on public.client_requests for update
  using (public.can_access_guardian_profile(profile_id))
  with check (public.can_access_guardian_profile(profile_id));

drop policy if exists "Owners can delete client requests" on public.client_requests;
create policy "Owners can delete client requests"
  on public.client_requests for delete
  using (public.can_manage_guardian_profile(profile_id));

-- ---------------------------------------------------------------------------
-- Threaded conversation per request
-- ---------------------------------------------------------------------------
create table if not exists public.client_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.client_requests (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint client_request_comments_content_not_empty
    check (char_length(trim(content)) > 0)
);

create index if not exists client_request_comments_request_idx
  on public.client_request_comments (request_id, created_at asc);

alter table public.client_request_comments enable row level security;

drop policy if exists "Members can view request comments" on public.client_request_comments;
create policy "Members can view request comments"
  on public.client_request_comments for select
  using (
    exists (
      select 1
      from public.client_requests r
      where r.id = request_id
        and public.can_access_guardian_profile(r.profile_id)
    )
  );

drop policy if exists "Members can add request comments" on public.client_request_comments;
create policy "Members can add request comments"
  on public.client_request_comments for insert
  with check (
    auth.uid() = author_user_id
    and exists (
      select 1
      from public.client_requests r
      where r.id = request_id
        and public.can_access_guardian_profile(r.profile_id)
    )
  );

drop policy if exists "Authors can delete own request comments" on public.client_request_comments;
create policy "Authors can delete own request comments"
  on public.client_request_comments for delete
  using (auth.uid() = author_user_id);

create or replace function public.touch_client_request_on_comment()
returns trigger
language plpgsql
as $$
begin
  update public.client_requests
  set updated_at = now()
  where id = new.request_id;
  return new;
end;
$$;

drop trigger if exists client_request_comments_touch_request on public.client_request_comments;
create trigger client_request_comments_touch_request
  after insert on public.client_request_comments
  for each row execute function public.touch_client_request_on_comment();

create or replace function public.client_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'resolved' and (old is null or old.status is distinct from 'resolved') then
    new.resolved_at = now();
  elsif new.status is distinct from 'resolved' then
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists client_requests_updated_at on public.client_requests;
create trigger client_requests_updated_at
  before update on public.client_requests
  for each row execute function public.client_requests_set_updated_at();
