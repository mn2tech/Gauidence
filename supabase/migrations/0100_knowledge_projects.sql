-- Knowledge Studio: generic curated knowledge projects (MCPS Parent Knowledge first).
-- Admin writes via service role after isPlatformAdmin(). Public reads only published items.

create table if not exists public.knowledge_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  authority_default text,
  disclaimer text,
  project_type text not null default 'organization'
    check (project_type in (
      'school_district',
      'school',
      'organization',
      'business',
      'community',
      'nonprofit',
      'government'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_project_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knowledge_projects (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, slug)
);

create index if not exists knowledge_project_categories_project_idx
  on public.knowledge_project_categories (project_id, sort_order);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knowledge_projects (id) on delete cascade,
  category_id uuid references public.knowledge_project_categories (id) on delete set null,
  source_name text not null,
  source_url text not null,
  category text not null,
  authority text not null,
  scope text not null default 'district'
    check (scope in ('district', 'school', 'grade_level', 'department', 'program')),
  school text,
  grade_level text,
  notes text,
  effective_date date,
  expires_at date,
  refresh_frequency text not null default 'manual'
    check (refresh_frequency in ('manual', 'daily', 'weekly', 'monthly')),
  last_checked_at timestamptz,
  last_successful_fetch_at timestamptz,
  content_hash text,
  status text not null default 'draft'
    check (status in (
      'draft',
      'fetching',
      'needs_review',
      'published',
      'failed',
      'archived'
    )),
  current_version_id uuid,
  published_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_url)
);

create index if not exists knowledge_sources_project_status_idx
  on public.knowledge_sources (project_id, status);

create index if not exists knowledge_sources_project_category_idx
  on public.knowledge_sources (project_id, category);

create table if not exists public.knowledge_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  version_number int not null,
  content_hash text not null,
  extracted_text text not null,
  status text not null default 'needs_review'
    check (status in (
      'draft',
      'needs_review',
      'published',
      'archived',
      'failed'
    )),
  change_summary text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, version_number)
);

create index if not exists knowledge_source_versions_source_idx
  on public.knowledge_source_versions (source_id, version_number desc);

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_current_version_id_fkey;
alter table public.knowledge_sources
  add constraint knowledge_sources_current_version_id_fkey
  foreign key (current_version_id)
  references public.knowledge_source_versions (id)
  on delete set null;

alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_published_version_id_fkey;
alter table public.knowledge_sources
  add constraint knowledge_sources_published_version_id_fkey
  foreign key (published_version_id)
  references public.knowledge_source_versions (id)
  on delete set null;

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knowledge_projects (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  version_id uuid references public.knowledge_source_versions (id) on delete set null,
  title text not null,
  content text not null,
  category text not null,
  subcategory text,
  school text,
  grade_level text,
  authority text,
  effective_date date,
  expires_at date,
  source_url text,
  evidence_text text not null default '',
  status text not null default 'needs_review'
    check (status in (
      'draft',
      'needs_review',
      'approved',
      'published',
      'rejected',
      'archived'
    )),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_items_project_status_idx
  on public.knowledge_items (project_id, status);

create index if not exists knowledge_items_source_idx
  on public.knowledge_items (source_id, status);

create index if not exists knowledge_items_published_retrieval_idx
  on public.knowledge_items (project_id, category, school)
  where status = 'published';

create or replace function public.set_knowledge_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_projects_set_updated_at on public.knowledge_projects;
create trigger knowledge_projects_set_updated_at
  before update on public.knowledge_projects
  for each row
  execute function public.set_knowledge_projects_updated_at();

create or replace function public.set_knowledge_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row
  execute function public.set_knowledge_sources_updated_at();

create or replace function public.set_knowledge_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_items_set_updated_at on public.knowledge_items;
create trigger knowledge_items_set_updated_at
  before update on public.knowledge_items
  for each row
  execute function public.set_knowledge_items_updated_at();

alter table public.knowledge_projects enable row level security;
alter table public.knowledge_project_categories enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_source_versions enable row level security;
alter table public.knowledge_items enable row level security;

-- Studio tables are admin-managed via service role. Published items may be read
-- by authenticated/anon clients for future parent-facing retrieval.
drop policy if exists "knowledge_items_public_select_published" on public.knowledge_items;
create policy "knowledge_items_public_select_published"
  on public.knowledge_items
  for select
  to anon, authenticated
  using (status = 'published');

comment on table public.knowledge_projects is
  'Curated Knowledge Studio projects (districts, orgs, etc.). Admin-managed.';
comment on table public.knowledge_sources is
  'Trusted public knowledge sources with refresh metadata. Admin-managed.';
comment on table public.knowledge_source_versions is
  'Immutable-ish source fetch versions for change detection and review.';
comment on table public.knowledge_items is
  'Extracted knowledge units. Only published rows are retrievable for answers.';

-- Seed MCPS Parent Knowledge project + initial empty categories.
insert into public.knowledge_projects (
  slug,
  name,
  description,
  authority_default,
  disclaimer,
  project_type
)
values (
  'mcps-parent',
  'MCPS Parent Knowledge',
  'Curated public information for Montgomery County Public Schools parents.',
  'Montgomery County Public Schools',
  $disclaimer$Guardian for MCPS Parents is an independent information assistant
and is not affiliated with or endorsed by Montgomery County Public Schools.

Information is derived from publicly available MCPS sources.
For official or time-sensitive decisions, verify information directly with MCPS.$disclaimer$,
  'school_district'
)
on conflict (slug) do nothing;

insert into public.knowledge_project_categories (project_id, slug, name, description, sort_order)
select p.id, c.slug, c.name, c.description, c.sort_order
from public.knowledge_projects p
cross join (
  values
    ('calendar', 'Calendar', 'School days, holidays, early release, professional days, breaks, closures', 10),
    ('schools', 'Schools', 'School directory, contacts, addresses, principals, levels, websites', 20),
    ('school-assignment', 'School Assignment', 'Boundaries, official assignment tool, assignment procedures', 30),
    ('transportation', 'Transportation', 'Bus policies, eligibility, delays, parent procedures, contacts', 40),
    ('parent-resources', 'Parent Resources', 'ParentVUE, registration, support, multilingual and district contacts', 50)
) as c(slug, name, description, sort_order)
where p.slug = 'mcps-parent'
on conflict (project_id, slug) do nothing;
