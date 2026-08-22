-- Guardian Knowledge Studio: curated event knowledge for public/member assistants.
create table if not exists public.knowledge_events (
  id uuid primary key default gen_random_uuid(),
  organization_slug text not null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  organizer text,
  contact text,
  rsvp_url text,
  cost text,
  audience text,
  source_label text,
  source_url text,
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','needs_review','approved','published','archived')),
  visibility text not null default 'private' check (visibility in ('private','members','public')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_events_org_start_idx
  on public.knowledge_events (organization_slug, start_at);
create index if not exists knowledge_events_public_idx
  on public.knowledge_events (organization_slug, lifecycle_status, visibility, start_at);

alter table public.knowledge_events enable row level security;

-- Anonymous/authenticated attendees can only read explicitly published public knowledge.
drop policy if exists "Public can read published public events" on public.knowledge_events;
create policy "Public can read published public events"
  on public.knowledge_events for select
  using (lifecycle_status = 'published' and visibility = 'public');

-- Admin writes intentionally use the service-role client after server-side ADMIN_EMAILS verification.
comment on table public.knowledge_events is
  'Curated Knowledge Studio event records. Public RLS exposes only published + public rows.';
