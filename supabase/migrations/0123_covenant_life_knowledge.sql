-- Knowledge Studio: Covenant Life School (single-school knowledge project).

insert into public.knowledge_projects (
  slug,
  name,
  description,
  authority_default,
  disclaimer,
  project_type
)
values (
  'covenant-life',
  'Covenant Life School',
  'Curated public information for Covenant Life School (Gaithersburg, MD) parents and families.',
  'Covenant Life School',
  $disclaimer$Guardian for Covenant Life School is an independent information assistant
and is not affiliated with or endorsed by Covenant Life School.

Information is derived from publicly available Covenant Life School sources.
For official or time-sensitive decisions, verify information directly with Covenant Life School.$disclaimer$,
  'school'
)
on conflict (slug) do nothing;

insert into public.knowledge_project_categories (project_id, slug, name, description, sort_order)
select p.id, c.slug, c.name, c.description, c.sort_order
from public.knowledge_projects p
cross join (
  values
    ('about', 'About', 'Mission, faith and values, guidance, employment', 10),
    ('admissions', 'Admissions', 'Process, standards, tuition, tours, open house, international', 20),
    ('academics', 'Academics', 'Preschool, elementary, middle school, high school programs', 30),
    ('calendar', 'Calendar', 'School calendar, events, athletics calendar', 40),
    ('athletics', 'Athletics', 'Sports programs, schedules, athletic information', 50),
    ('parent-resources', 'Parent Resources', 'FACTS portal, communications, lunch, supplies, weather', 60),
    ('community', 'Community', 'Uniforms, after care, summer camps, parent involvement', 70),
    ('health-safety', 'Health & Safety', 'Student health, safety standards, emergency communications', 80),
    ('contact', 'Contact', 'Address, phone, email, faculty directory', 90)
) as c(slug, name, description, sort_order)
where p.slug = 'covenant-life'
on conflict (project_id, slug) do nothing;
