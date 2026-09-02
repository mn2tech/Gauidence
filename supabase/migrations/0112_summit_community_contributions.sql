-- Summit community contributions: attendee knowledge submissions with moderation workflow.
-- Anonymous users may INSERT; only published rows are readable via API (private fields stripped server-side).

-- ---------------------------------------------------------------------------
-- 1. Community contributions
-- ---------------------------------------------------------------------------
create table if not exists public.summit_community_contributions (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  contribution_type text not null check (contribution_type in (
    'photo', 'takeaway', 'opportunity', 'resource', 'note'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'published')),
  content text not null,
  session_entity_id uuid references public.summit_entities (id) on delete set null,
  organization_entity_id uuid references public.summit_entities (id) on delete set null,
  speaker_entity_id uuid references public.summit_entities (id) on delete set null,
  source_url text,
  contributor_name text,
  contributor_company text,
  contributor_email text,
  display_name_publicly boolean not null default false,
  permission_confirmed boolean not null default false,
  file_path text,
  file_mime_type text,
  extracted_data jsonb not null default '{}'::jsonb,
  approved_entities jsonb not null default '[]'::jsonb,
  published_entity_ids uuid[] not null default '{}',
  published_summary text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  rejection_reason text,
  submission_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists summit_community_contributions_slug_status_idx
  on public.summit_community_contributions (summit_slug, status);
create index if not exists summit_community_contributions_slug_published_idx
  on public.summit_community_contributions (summit_slug, published_at desc)
  where status = 'published';

alter table public.summit_community_contributions enable row level security;

-- Anon/authenticated may insert contributions for public summit spaces.
drop policy if exists "Anon can insert summit community contributions" on public.summit_community_contributions;
create policy "Anon can insert summit community contributions"
  on public.summit_community_contributions for insert
  to anon, authenticated
  with check (
    permission_confirmed = true
    and exists (
      select 1 from public.summit_spaces s
      where s.slug = summit_slug and s.is_public = true
    )
  );

-- No public SELECT/UPDATE/DELETE policies — reads and moderation via service role after auth checks.

-- ---------------------------------------------------------------------------
-- 2. Rate limiting events for anonymous submissions
-- ---------------------------------------------------------------------------
create table if not exists public.summit_contribution_rate_events (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists summit_contribution_rate_events_lookup_idx
  on public.summit_contribution_rate_events (summit_slug, ip_hash, created_at desc);

alter table public.summit_contribution_rate_events enable row level security;

-- No public policies — rate check via service role in API.

-- ---------------------------------------------------------------------------
-- 3. Storage bucket for contribution uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'summit-contributions',
  'summit-contributions',
  false,
  10485760, -- 10 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No public storage policies — signed URLs generated server-side for admin review.

comment on table public.summit_community_contributions is
  'Attendee community knowledge submissions. Moderated before publication to summit knowledge graph.';
comment on table public.summit_contribution_rate_events is
  'Rate-limit tracking for anonymous summit contribution submissions.';
