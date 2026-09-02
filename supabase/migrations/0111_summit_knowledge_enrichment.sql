-- Enrich 2026 Small Business Government Contracting Summit knowledge graph:
-- opportunities, agencies, resources, takeaways, cross-links, org enrichment.

-- ---------------------------------------------------------------------------
-- Enrich prime contractor organizations
-- ---------------------------------------------------------------------------
update public.summit_entities set
  description = 'Science Applications International Corporation (SAIC) — prime contractor represented on the subcontracting panel. SAIC maintains a Corporate Small Business Program for supplier and subcontracting engagement.',
  properties = jsonb_build_object(
    'role', 'prime_contractor',
    'small_business_engagement', 'Corporate Small Business Program',
    'engagement_path', 'Contact the Corporate Small Business Program to learn about supplier registration, capability briefings, and subcontracting pathways.',
    'federal_focus', 'Defense, intelligence, and civilian IT and engineering services',
    'questions_to_ask', jsonb_build_array(
      'How does SAIC''s Corporate Small Business Program evaluate new suppliers?',
      'What capability areas is SAIC actively seeking small business partners for?',
      'What is the recommended first step after supplier registration?'
    )
  ),
  last_updated_at = now(),
  updated_at = now()
where summit_slug = 'small-business-summit-2026' and slug = 'saic';

update public.summit_entities set
  description = 'NTT DATA — global IT services provider and prime contractor represented on the subcontracting panel. NTT DATA Federal supports GWAC and IDIQ contract vehicles.',
  properties = jsonb_build_object(
    'role', 'prime_contractor',
    'small_business_engagement', 'GWAC/IDIQ Programs',
    'engagement_path', 'Engage through NTT DATA Federal small business and teaming channels to discuss GWAC/IDIQ subcontracting and partnership opportunities.',
    'federal_focus', 'Federal IT modernization, cloud, data, and managed services',
    'questions_to_ask', jsonb_build_array(
      'Which GWAC or IDIQ vehicles does NTT DATA Federal use for teaming?',
      'What technical capabilities are priorities for small business partners?',
      'Who is the right program or capture contact for my capability area?'
    )
  ),
  last_updated_at = now(),
  updated_at = now()
where summit_slug = 'small-business-summit-2026' and slug = 'ntt-data';

update public.summit_entities set
  description = 'SOS International (SOSI) — prime contractor represented on the subcontracting panel with a Small Business Liaison and GSA contract management focus.',
  properties = jsonb_build_object(
    'role', 'prime_contractor',
    'small_business_engagement', 'Small Business Liaison / GSA Contract Management',
    'engagement_path', 'Connect with the Small Business Liaison to discuss GSA contract teaming and subcontracting opportunities.',
    'federal_focus', 'Defense, stabilization, and mission support services',
    'questions_to_ask', jsonb_build_array(
      'How does SOSI manage small business participation on GSA contracts?',
      'What past performance or certifications matter most for teaming?',
      'What is the best way to introduce my capability statement?'
    )
  ),
  last_updated_at = now(),
  updated_at = now()
where summit_slug = 'small-business-summit-2026' and slug = 'sosi';

update public.summit_entities set
  description = 'The Boeing Company — prime contractor represented on the subcontracting panel through Boeing Defense, Space & Security Strategic Sourcing & Partnerships.',
  properties = jsonb_build_object(
    'role', 'prime_contractor',
    'division', 'Boeing Defense, Space & Security',
    'small_business_engagement', 'Strategic Sourcing & Partnerships',
    'engagement_path', 'Engage Boeing Defense, Space & Security Strategic Sourcing & Partnerships for supplier and small business outreach.',
    'federal_focus', 'Defense, space, and security systems',
    'questions_to_ask', jsonb_build_array(
      'What supplier categories is Boeing Defense actively sourcing?',
      'What is the process after Boeing supplier registration?',
      'How should small businesses align capabilities to Boeing program needs?'
    )
  ),
  last_updated_at = now(),
  updated_at = now()
where summit_slug = 'small-business-summit-2026' and slug = 'boeing';

-- ---------------------------------------------------------------------------
-- Opportunities (summit-derived; no unverified open solicitations claimed)
-- ---------------------------------------------------------------------------
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_type
) values
  ('small-business-summit-2026', 'opportunity', 'explore-saic-small-business-subcontracting',
   'Explore SAIC Small Business Subcontracting',
   'Follow-up pathway to explore subcontracting engagement with SAIC through its Corporate Small Business Program, as discussed on the subcontracting panel.',
   jsonb_build_object(
     'opportunity_type', 'Prime Contractor Outreach',
     'organization_slug', 'saic',
     'why_it_matters', 'SAIC was represented on the summit subcontracting panel and maintains a dedicated small business program for supplier engagement.',
     'recommended_next_step', 'Research SAIC''s Corporate Small Business Program and prepare a capability statement aligned to your core competencies.',
     'capability_areas', jsonb_build_array('IT', 'engineering', 'mission support')
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'opportunity', 'explore-ntt-data-federal-teaming',
   'Explore NTT DATA Federal Teaming',
   'Follow-up pathway to explore teaming and subcontracting with NTT DATA Federal, including GWAC/IDIQ program engagement discussed on the panel.',
   jsonb_build_object(
     'opportunity_type', 'Teaming',
     'organization_slug', 'ntt-data',
     'why_it_matters', 'NTT DATA Federal was represented on the subcontracting panel with a focus on GWAC/IDIQ programs — a common federal teaming pathway for small businesses.',
     'recommended_next_step', 'Identify which NTT DATA Federal contract vehicles align with your NAICS and past performance, then request a capability briefing.',
     'capability_areas', jsonb_build_array('IT modernization', 'cloud', 'data', 'cybersecurity')
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'opportunity', 'explore-sosi-small-business-opportunities',
   'Explore SOSI Small Business Opportunities',
   'Follow-up pathway to explore small business teaming with SOS International through its Small Business Liaison and GSA contract management channels.',
   jsonb_build_object(
     'opportunity_type', 'Prime Contractor Outreach',
     'organization_slug', 'sosi',
     'why_it_matters', 'SOSI was represented on the subcontracting panel with a dedicated Small Business Liaison focused on GSA contract participation.',
     'recommended_next_step', 'Contact the SOSI Small Business Liaison with a concise capability statement and relevant past performance.',
     'capability_areas', jsonb_build_array('mission support', 'stabilization', 'professional services')
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'opportunity', 'explore-boeing-supplier-opportunities',
   'Explore Boeing Supplier / Small Business Opportunities',
   'Follow-up pathway to explore supplier and small business engagement with Boeing Defense, Space & Security Strategic Sourcing & Partnerships.',
   jsonb_build_object(
     'opportunity_type', 'Subcontracting',
     'organization_slug', 'boeing',
     'why_it_matters', 'Boeing was represented on the subcontracting panel through Strategic Sourcing & Partnerships — the entry point for supplier and small business outreach.',
     'recommended_next_step', 'Review Boeing supplier registration requirements and align your capability statement to defense and space program needs.',
     'capability_areas', jsonb_build_array('defense', 'aerospace', 'manufacturing', 'engineering')
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'opportunity', 'connect-with-apex-accelerator',
   'Connect with APEX Accelerator',
   'Follow-up pathway to connect with APEX Accelerator procurement counseling, represented on the subcontracting panel.',
   jsonb_build_object(
     'opportunity_type', 'Business Development',
     'organization_slug', 'apex-accelerator',
     'why_it_matters', 'APEX Accelerators provide no-cost procurement counseling to help small businesses navigate federal contracting — a practical next step after the summit.',
     'recommended_next_step', 'Locate your nearest APEX Accelerator and schedule a counseling session to build a post-summit action plan.',
     'capability_areas', jsonb_build_array('procurement counseling', 'capability statements', 'market research')
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  source_label = excluded.source_label,
  source_type = excluded.source_type,
  last_updated_at = now(),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Agencies (PUBLIC — verified federal small-business contracting context)
-- ---------------------------------------------------------------------------
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_url, source_type
) values
  ('small-business-summit-2026', 'agency', 'small-business-administration',
   'U.S. Small Business Administration (SBA)',
   'The SBA is the federal agency dedicated to supporting small businesses, including contracting assistance, certifications, and subcontracting programs.',
   jsonb_build_object(
     'why_it_matters', 'SBA sets small business size standards, runs certification programs (8(a), HUBZone, WOSB, SDVOSB), and provides contracting assistance resources essential for federal market entry.',
     'official_resource_url', 'https://www.sba.gov/federal-contracting',
     'small_business_resources', jsonb_build_array('Federal contracting guide', 'Certification programs', 'Subcontracting assistance')
   ),
   'published', 'public', 'U.S. Small Business Administration', 'https://www.sba.gov/federal-contracting', 'public'),
  ('small-business-summit-2026', 'agency', 'general-services-administration',
   'U.S. General Services Administration (GSA)',
   'GSA manages government-wide acquisition contracts, schedules, and small business programs that shape how many federal agencies buy goods and services.',
   jsonb_build_object(
     'why_it_matters', 'GSA contract vehicles (Schedules, GWACs) are a primary pathway for small businesses to sell to multiple federal agencies through established contracting vehicles.',
     'official_resource_url', 'https://www.gsa.gov/small-business',
     'small_business_resources', jsonb_build_array('GSA Schedules', 'Small business set-asides', 'OSDBU resources')
   ),
   'published', 'public', 'U.S. General Services Administration', 'https://www.gsa.gov/small-business', 'public')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  last_updated_at = now(),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Resources (PUBLIC — authoritative .gov and official sources)
-- ---------------------------------------------------------------------------
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_url, source_type
) values
  ('small-business-summit-2026', 'resource', 'sam-gov',
   'SAM.gov',
   'The official U.S. government system for entity registration, exclusions, and federal contract opportunities.',
   jsonb_build_object(
     'who_should_use', 'All businesses pursuing federal contracts',
     'why_it_matters', 'Active SAM.gov registration is required to receive federal awards. This is the authoritative source for federal contract opportunities.',
     'official_url', 'https://sam.gov',
     'related_category', 'opportunities'
   ),
   'published', 'public', 'SAM.gov — U.S. General Services Administration', 'https://sam.gov', 'public'),
  ('small-business-summit-2026', 'resource', 'sba-federal-contracting',
   'SBA Federal Contracting Assistance',
   'SBA''s guide to entering and succeeding in the federal marketplace, including size standards, certifications, and contracting programs.',
   jsonb_build_object(
     'who_should_use', 'Small businesses new to federal contracting',
     'why_it_matters', 'Provides the foundational steps for federal market entry, including understanding set-asides and SBA certification programs.',
     'official_url', 'https://www.sba.gov/federal-contracting',
     'related_category', 'resources'
   ),
   'published', 'public', 'U.S. Small Business Administration', 'https://www.sba.gov/federal-contracting', 'public'),
  ('small-business-summit-2026', 'resource', 'sba-subcontracting',
   'SBA Subcontracting Resources',
   'SBA resources for finding and pursuing subcontracting opportunities with prime contractors.',
   jsonb_build_object(
     'who_should_use', 'Small businesses pursuing subcontracting with primes',
     'why_it_matters', 'Subcontracting is a primary entry path discussed at the summit. SBA provides tools and guidance for finding subcontracting opportunities.',
     'official_url', 'https://www.sba.gov/federal-contracting/contracting-guide/resources/subcontracting-opportunities',
     'related_category', 'opportunities'
   ),
   'published', 'public', 'U.S. Small Business Administration', 'https://www.sba.gov/federal-contracting/contracting-guide/resources/subcontracting-opportunities', 'public'),
  ('small-business-summit-2026', 'resource', 'apex-accelerators',
   'APEX Accelerators',
   'The national network of procurement technical assistance centers providing no-cost counseling to businesses pursuing government contracts.',
   jsonb_build_object(
     'who_should_use', 'Small businesses seeking procurement counseling',
     'why_it_matters', 'APEX Accelerators were represented on the summit subcontracting panel. They provide practical, no-cost guidance for post-summit action planning.',
     'official_url', 'https://www.apexaccelerators.us',
     'related_category', 'resources'
   ),
   'published', 'public', 'APEX Accelerators', 'https://www.apexaccelerators.us', 'public'),
  ('small-business-summit-2026', 'resource', 'sba-small-business-search',
   'SBA Small Business Search',
   'SBA''s searchable directory of small businesses registered for federal contracting, used by agencies and primes to find qualified small business partners.',
   jsonb_build_object(
     'who_should_use', 'Small businesses wanting visibility to agencies and primes',
     'why_it_matters', 'Ensures your business profile is discoverable by federal buyers and prime contractors seeking small business partners.',
     'official_url', 'https://search.sam.gov/search/?index=sb',
     'related_category', 'prime-contractors'
   ),
   'published', 'public', 'U.S. Small Business Administration', 'https://search.sam.gov/search/?index=sb', 'public'),
  ('small-business-summit-2026', 'resource', 'gsa-small-business',
   'GSA Small Business Resources',
   'GSA''s small business contracting resources, including Schedules, set-asides, and OSDBU guidance.',
   jsonb_build_object(
     'who_should_use', 'Small businesses pursuing GSA contract vehicles',
     'why_it_matters', 'GSA manages major contract vehicles referenced in summit discussions (e.g., GSA contract management at SOSI).',
     'official_url', 'https://www.gsa.gov/small-business',
     'related_category', 'agencies'
   ),
   'published', 'public', 'U.S. General Services Administration', 'https://www.gsa.gov/small-business', 'public')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  last_updated_at = now(),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Summit Takeaways
-- ---------------------------------------------------------------------------
insert into public.summit_entities (
  summit_slug, entity_type, slug, name, description,
  properties, lifecycle_status, visibility, source_label, source_type
) values
  ('small-business-summit-2026', 'action_item', 'takeaway-explore-subcontracting-pathways',
   'Explore subcontracting pathways with panel prime contractors',
   'The subcontracting panel brought together prime contractors and support organizations to discuss how small businesses can engage through subcontracting and teaming — not just registration.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'evidence', 'Subcontracting Opportunities for Small Businesses panel'
   ),
   'published', 'public', '2026 Small Business Government Contracting Summit — Subcontracting Panel', 'summit'),
  ('small-business-summit-2026', 'action_item', 'takeaway-dont-stop-at-registration',
   'Don''t stop at supplier registration',
   'Supplier registration is a starting point, not the finish line. Small businesses should follow up with program teams and capability briefings after registering.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'synthesis_basis', 'Summit panel themes on prime contractor small business engagement'
   ),
   'published', 'public', 'Guardian synthesis from summit subcontracting panel themes', 'guardian_insight'),
  ('small-business-summit-2026', 'action_item', 'takeaway-find-capture-team',
   'Find the capture/program team',
   'Identify the right capture manager or program team contact at your target prime — not just the general small business inbox.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'synthesis_basis', 'Summit panel themes on prime contractor engagement'
   ),
   'published', 'public', 'Guardian synthesis from summit subcontracting panel themes', 'guardian_insight'),
  ('small-business-summit-2026', 'action_item', 'takeaway-build-relationships-early',
   'Build relationships before the solicitation',
   'Prime contractor relationships and capability awareness are built before RFPs drop — not after.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'synthesis_basis', 'Summit panel themes on subcontracting and teaming'
   ),
   'published', 'public', 'Guardian synthesis from summit subcontracting panel themes', 'guardian_insight'),
  ('small-business-summit-2026', 'action_item', 'takeaway-know-contract-vehicles',
   'Know which contract vehicles your target prime uses',
   'Understanding GWACs, IDIQs, and GSA Schedules used by your target prime helps you position for the right teaming opportunities.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'synthesis_basis', 'Summit panel discussion of GWAC/IDIQ and GSA contract vehicles'
   ),
   'published', 'public', 'Guardian synthesis from summit subcontracting panel themes', 'guardian_insight'),
  ('small-business-summit-2026', 'action_item', 'takeaway-specific-capability-statement',
   'Make your capability statement specific to the opportunity',
   'Generic capability statements are less effective. Tailor your statement to the prime''s program needs and contract vehicle context.',
   jsonb_build_object(
     'category', 'takeaway',
     'session_slug', 'subcontracting-opportunities',
     'synthesis_basis', 'Summit panel themes on small business engagement'
   ),
   'published', 'public', 'Guardian synthesis from summit subcontracting panel themes', 'guardian_insight')
on conflict (summit_slug, slug) do update set
  name = excluded.name,
  description = excluded.description,
  properties = excluded.properties,
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  source_label = excluded.source_label,
  source_type = excluded.source_type,
  last_updated_at = now(),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Relationships: Opportunity → related_to → Organization
-- ---------------------------------------------------------------------------
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  opp.id,
  'related_to',
  org.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities opp
join public.summit_entities org
  on org.summit_slug = opp.summit_slug
  and org.entity_type = 'organization'
  and org.slug = (opp.properties->>'organization_slug')
where opp.summit_slug = 'small-business-summit-2026'
  and opp.entity_type = 'opportunity'
  and opp.slug in (
    'explore-saic-small-business-subcontracting',
    'explore-ntt-data-federal-teaming',
    'explore-sosi-small-business-opportunities',
    'explore-boeing-supplier-opportunities',
    'connect-with-apex-accelerator'
  )
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Opportunity → related_to → Session
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  opp.id,
  'related_to',
  sess.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities opp
cross join public.summit_entities sess
where opp.summit_slug = 'small-business-summit-2026'
  and sess.summit_slug = 'small-business-summit-2026'
  and opp.entity_type = 'opportunity'
  and sess.entity_type = 'session'
  and sess.slug = 'subcontracting-opportunities'
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Takeaway → related_to → Session
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  t.id,
  'related_to',
  sess.id,
  'published',
  'public',
  coalesce(t.source_label, 'Summit materials')
from public.summit_entities t
cross join public.summit_entities sess
where t.summit_slug = 'small-business-summit-2026'
  and sess.summit_slug = 'small-business-summit-2026'
  and t.entity_type = 'action_item'
  and (t.properties->>'category') = 'takeaway'
  and sess.entity_type = 'session'
  and sess.slug = 'subcontracting-opportunities'
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Resource → supports → Agency (SBA/GSA resources)
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  r.id,
  'supports',
  a.id,
  'published',
  'public',
  r.source_label
from public.summit_entities r
join public.summit_entities a
  on a.summit_slug = r.summit_slug
  and a.entity_type = 'agency'
where r.summit_slug = 'small-business-summit-2026'
  and r.entity_type = 'resource'
  and (
    (r.slug in ('sba-federal-contracting', 'sba-subcontracting', 'sba-small-business-search') and a.slug = 'small-business-administration') or
    (r.slug = 'gsa-small-business' and a.slug = 'general-services-administration')
  )
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();

-- Relationships: Organization → offers → Opportunity (reverse discoverability)
insert into public.summit_relationships (
  summit_slug, source_entity_id, relationship_type, target_entity_id,
  lifecycle_status, visibility, source_label
)
select
  'small-business-summit-2026',
  org.id,
  'offers',
  opp.id,
  'published',
  'public',
  '2026 Small Business Government Contracting Summit — Subcontracting Panel'
from public.summit_entities opp
join public.summit_entities org
  on org.summit_slug = opp.summit_slug
  and org.entity_type = 'organization'
  and org.slug = (opp.properties->>'organization_slug')
where opp.summit_slug = 'small-business-summit-2026'
  and opp.entity_type = 'opportunity'
on conflict (summit_slug, source_entity_id, relationship_type, target_entity_id) do update set
  lifecycle_status = excluded.lifecycle_status,
  visibility = excluded.visibility,
  updated_at = now();
