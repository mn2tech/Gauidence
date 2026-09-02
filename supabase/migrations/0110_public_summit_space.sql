-- Public Summit Space: extends guardian_profiles for shareable event knowledge hubs.
-- Anonymous attendees read published+public summit entities; private capture stays owner-only.

-- ---------------------------------------------------------------------------
-- 1. Extend guardian_profiles for public share links
-- ---------------------------------------------------------------------------
alter table public.guardian_profiles
  add column if not exists public_slug text,
  add column if not exists public_subtitle text,
  add column if not exists is_public boolean not null default false,
  add column if not exists public_owner_label text;

create unique index if not exists guardian_profiles_public_slug_idx
  on public.guardian_profiles (public_slug)
  where public_slug is not null;

comment on column public.guardian_profiles.public_slug is
  'URL slug for public share link, e.g. small-business-summit-2026 → /s/{slug}';
comment on column public.guardian_profiles.is_public is
  'When true, anonymous users can read published public summit content linked to this profile.';

-- Anon/authenticated users may read public profile metadata (name, slug, subtitle).
drop policy if exists "Public can read public guardian profiles" on public.guardian_profiles;
create policy "Public can read public guardian profiles"
  on public.guardian_profiles for select
  to anon, authenticated
  using (is_public = true);

-- ---------------------------------------------------------------------------
-- 2. Summit registry (slug-keyed; links to guardian_profiles when owner sets up)
-- ---------------------------------------------------------------------------
create table if not exists public.summit_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  name text not null,
  subtitle text,
  description text,
  owner_label text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists summit_spaces_profile_idx
  on public.summit_spaces (profile_id)
  where profile_id is not null;

alter table public.summit_spaces enable row level security;

drop policy if exists "Public can read public summit spaces" on public.summit_spaces;
create policy "Public can read public summit spaces"
  on public.summit_spaces for select
  to anon, authenticated
  using (is_public = true);

-- ---------------------------------------------------------------------------
-- 3. Summit entities (structured knowledge)
-- ---------------------------------------------------------------------------
create table if not exists public.summit_entities (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  entity_type text not null check (entity_type in (
    'organization', 'person', 'session', 'opportunity', 'agency',
    'contract_vehicle', 'resource', 'action_item', 'capability'
  )),
  slug text,
  name text not null,
  description text,
  properties jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'needs_review', 'published', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  source_label text,
  source_url text,
  source_type text not null default 'summit',
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summit_entities_slug_unique unique (summit_slug, slug)
);

create index if not exists summit_entities_slug_type_idx
  on public.summit_entities (summit_slug, entity_type);
create index if not exists summit_entities_public_idx
  on public.summit_entities (summit_slug, lifecycle_status, visibility);

alter table public.summit_entities enable row level security;

drop policy if exists "Public can read published public summit entities" on public.summit_entities;
create policy "Public can read published public summit entities"
  on public.summit_entities for select
  to anon, authenticated
  using (lifecycle_status = 'published' and visibility = 'public');

-- ---------------------------------------------------------------------------
-- 4. Summit relationships
-- ---------------------------------------------------------------------------
create table if not exists public.summit_relationships (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  source_entity_id uuid not null references public.summit_entities (id) on delete cascade,
  relationship_type text not null,
  target_entity_id uuid not null references public.summit_entities (id) on delete cascade,
  properties jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'needs_review', 'published', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  source_label text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summit_relationships_no_self_loop check (source_entity_id <> target_entity_id),
  constraint summit_relationships_unique
    unique (summit_slug, source_entity_id, relationship_type, target_entity_id)
);

create index if not exists summit_relationships_source_idx
  on public.summit_relationships (source_entity_id);
create index if not exists summit_relationships_target_idx
  on public.summit_relationships (target_entity_id);

alter table public.summit_relationships enable row level security;

drop policy if exists "Public can read published public summit relationships" on public.summit_relationships;
create policy "Public can read published public summit relationships"
  on public.summit_relationships for select
  to anon, authenticated
  using (lifecycle_status = 'published' and visibility = 'public');

-- ---------------------------------------------------------------------------
-- 5. Private NM2TECH capture (owner-only; never public)
-- ---------------------------------------------------------------------------
create table if not exists public.summit_private_capture (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  organization_entity_id uuid references public.summit_entities (id) on delete cascade,
  organization_name text not null,
  priority text not null default 'MEDIUM'
    check (priority in ('HIGH', 'MEDIUM', 'LOW')),
  relationship_strength text,
  opportunity_fit text,
  capabilities_to_pitch text,
  next_action text,
  follow_up_date date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summit_private_capture_org_unique unique (summit_slug, organization_name)
);

create index if not exists summit_private_capture_slug_idx
  on public.summit_private_capture (summit_slug);

alter table public.summit_private_capture enable row level security;

-- No public policies — owner reads/writes via service role after membership check.

-- ---------------------------------------------------------------------------
-- 6. Summit intelligence drafts (pending owner review from uploads)
-- ---------------------------------------------------------------------------
create table if not exists public.summit_intelligence_drafts (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  draft_type text not null check (draft_type in (
    'note', 'photo', 'presentation', 'person', 'organization',
    'opportunity', 'resource', 'extracted'
  )),
  title text,
  extracted_data jsonb not null default '{}'::jsonb,
  source_document_id uuid references public.documents (id) on delete set null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists summit_intelligence_drafts_slug_status_idx
  on public.summit_intelligence_drafts (summit_slug, status);

alter table public.summit_intelligence_drafts enable row level security;

-- No public policies — owner access via service role.

-- ---------------------------------------------------------------------------
-- 7. Summit leads (anon insert; owner read via service role)
-- ---------------------------------------------------------------------------
create table if not exists public.summit_leads (
  id uuid primary key default gen_random_uuid(),
  summit_slug text not null references public.summit_spaces (slug) on delete cascade,
  name text not null,
  company text,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists summit_leads_slug_idx
  on public.summit_leads (summit_slug, created_at desc);

alter table public.summit_leads enable row level security;

drop policy if exists "Anon can insert summit leads" on public.summit_leads;
create policy "Anon can insert summit leads"
  on public.summit_leads for insert
  to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 8. Seed: 2026 Small Business Government Contracting Summit
-- ---------------------------------------------------------------------------
insert into public.summit_spaces (slug, name, subtitle, description, owner_label, is_public)
values (
  'small-business-summit-2026',
  '2026 Small Business Government Contracting Summit',
  'Small Business Contracting Intelligence Hub',
  'A Guardian-powered knowledge hub containing contracting resources, prime contractor insights, subcontracting opportunities, session takeaways, and follow-up resources from the 2026 Small Business Government Contracting Summit.',
  'NM2TECH LLC',
  true
)
on conflict (slug) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  description = excluded.description,
  owner_label = excluded.owner_label,
  is_public = excluded.is_public,
  updated_at = now();

-- Session
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_type
) values (
  'small-business-summit-2026', 'session', 'subcontracting-opportunities',
  'Subcontracting Opportunities for Small Businesses',
  'Panel discussion on subcontracting opportunities for small businesses with prime contractors and support organizations.',
  '{"topic": "subcontracting", "format": "panel"}'::jsonb,
  'published', 'public', '2026 Small Business Government Contracting Summit', 'summit'
)
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  last_updated_at = now(),
  updated_at = now();

-- Organizations
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_type
) values
  ('small-business-summit-2026', 'organization', 'saic', 'SAIC',
   'Science Applications International Corporation — prime contractor participating in the subcontracting panel.',
   '{"role": "prime_contractor", "small_business_engagement": "Corporate Small Business Program"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'organization', 'ntt-data', 'NTT DATA',
   'Global IT services provider — prime contractor participating in the subcontracting panel.',
   '{"role": "prime_contractor", "small_business_engagement": "GWAC/IDIQ Programs"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'organization', 'sosi', 'SOS International (SOSI)',
   'SOS International — prime contractor participating in the subcontracting panel.',
   '{"role": "prime_contractor", "small_business_engagement": "Small Business Liaison / GSA Contract Management"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'organization', 'boeing', 'The Boeing Company',
   'The Boeing Company — prime contractor participating in the subcontracting panel.',
   '{"role": "prime_contractor", "division": "Boeing Defense, Space & Security", "small_business_engagement": "Strategic Sourcing & Partnerships"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'organization', 'apex-accelerator', 'APEX Accelerator',
   'APEX Accelerator — procurement counseling and small business support organization.',
   '{"role": "support_organization", "small_business_engagement": "Procurement counseling for small businesses"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  last_updated_at = now(),
  updated_at = now();

-- Speakers
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_type
) values
  ('small-business-summit-2026', 'person', 'rita-brooks', 'Rita Brooks',
   'Director, Corporate Small Business Program at SAIC.',
   '{"title": "Director, Corporate Small Business Program", "organization": "SAIC"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'person', 'ella-obrien', 'Ella O''Brien',
   'Small Business Liaison Officer / GSA Contract Manager at SOS International (SOSI).',
   '{"title": "Small Business Liaison Officer / GSA Contract Manager", "organization": "SOS International (SOSI)"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'person', 'michael-townsend', 'Michael Townsend',
   'Procurement Counselor at APEX Accelerator.',
   '{"title": "Procurement Counselor", "organization": "APEX Accelerator"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'person', 'tyler-brooks-craft', 'Tyler Brooks-Craft',
   'Director, GWAC/IDIQ Programs at NTT DATA.',
   '{"title": "Director, GWAC/IDIQ Programs", "organization": "NTT DATA"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'person', 'david-canada', 'David Canada',
   'Director, Strategic Sourcing & Partnerships, Boeing Defense, Space & Security at The Boeing Company.',
   '{"title": "Director, Strategic Sourcing & Partnerships", "organization": "The Boeing Company", "division": "Boeing Defense, Space & Security"}'::jsonb,
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  last_updated_at = now(),
  updated_at = now();

-- Relationships: Person → works_for → Organization
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  p.id,
  'works_for',
  o.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities p
join public.summit_entities o
  on o.summit_slug = p.summit_slug
  and o.entity_type = 'organization'
where p.summit_slug = 'small-business-summit-2026'
  and p.entity_type = 'person'
  and (
    (p.slug = 'rita-brooks' and o.slug = 'saic') or
    (p.slug = 'ella-obrien' and o.slug = 'sosi') or
    (p.slug = 'michael-townsend' and o.slug = 'apex-accelerator') or
    (p.slug = 'tyler-brooks-craft' and o.slug = 'ntt-data') or
    (p.slug = 'david-canada' and o.slug = 'boeing')
  )
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Person → spoke_at → Session
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  p.id,
  'spoke_at',
  s.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities p
cross join public.summit_entities s
where p.summit_slug = 'small-business-summit-2026'
  and s.summit_slug = 'small-business-summit-2026'
  and p.entity_type = 'person'
  and s.entity_type = 'session'
  and s.slug = 'subcontracting-opportunities'
  and p.slug in ('rita-brooks', 'ella-obrien', 'michael-townsend', 'tyler-brooks-craft', 'david-canada')
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Session → mentions → Organization
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  s.id,
  'mentions',
  o.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities s
cross join public.summit_entities o
where s.summit_slug = 'small-business-summit-2026'
  and o.summit_slug = 'small-business-summit-2026'
  and s.entity_type = 'session'
  and s.slug = 'subcontracting-opportunities'
  and o.entity_type = 'organization'
  and o.slug in ('saic', 'ntt-data', 'sosi', 'boeing', 'apex-accelerator')
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Private capture priorities (owner-only; inserted via service role in app seed)
-- These are NOT in public RLS — seeded by ensureSummitPrivateCapture() in application code.

comment on table public.summit_spaces is
  'Public summit knowledge hubs. Extends guardian_profiles via optional profile_id link.';
comment on table public.summit_entities is
  'Structured summit knowledge entities. Public RLS exposes only published+public rows.';
comment on table public.summit_private_capture is
  'Owner-only NM2TECH capture notes. Never exposed via public RLS.';
