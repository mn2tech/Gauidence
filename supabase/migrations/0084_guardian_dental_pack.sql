-- Guardian Dental Pack #002 v1.0.0
-- Definitions-first industry pack on Pack Engine (no separate app/DB).
-- Rollback (manual):
--   delete from public.packs where slug = 'guardian-dental';
--   (cascades pack_versions + definition children)

do $$
declare
  v_pack_id uuid;
  v_version_id uuid;
begin
  insert into public.packs (slug, name, description, category, status, pack_number)
  values (
    'guardian-dental',
    'Guardian Dental',
    'Dental practice operations intelligence. Teach Guardian how to understand patients, providers, appointments, treatment plans, insurance claims, and clinical follow-ups.',
    'industry',
    'available',
    2
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    status = excluded.status,
    pack_number = excluded.pack_number,
    updated_at = now()
  returning id into v_pack_id;

  select id into v_pack_id from public.packs where slug = 'guardian-dental';

  insert into public.pack_versions (pack_id, version, changelog, status, published_at)
  values (
    v_pack_id,
    '1.0.0',
    'Initial Guardian Dental Pack: patients, providers, appointments, treatment plans, claims, recommended Spaces, Dental Practice Ops skill, dashboard.',
    'published',
    now()
  )
  on conflict (pack_id, version) do update set
    changelog = excluded.changelog,
    status = excluded.status,
    updated_at = now()
  returning id into v_version_id;

  select id into v_version_id
  from public.pack_versions
  where pack_id = v_pack_id and version = '1.0.0';

  -- Entity types
  insert into public.pack_entity_types (pack_version_id, key, label, description, sort_order)
  values
    (v_version_id, 'organization', 'Practice', 'Dental practice or clinic organization', 10),
    (v_version_id, 'person', 'Person', 'Individual person', 20),
    (v_version_id, 'patient', 'Patient', 'Dental patient', 30),
    (v_version_id, 'provider', 'Provider', 'Dentist, hygienist, or clinical provider', 40),
    (v_version_id, 'contact', 'Contact', 'Emergency contact or family contact', 50),
    (v_version_id, 'appointment', 'Appointment', 'Scheduled or completed dental visit', 60),
    (v_version_id, 'treatment_plan', 'Treatment plan', 'Proposed or active treatment plan', 70),
    (v_version_id, 'treatment', 'Treatment', 'Dental procedure or service line item', 80),
    (v_version_id, 'claim', 'Insurance claim', 'Insurance claim for treatment', 90),
    (v_version_id, 'payer', 'Payer', 'Insurance carrier or benefits payer', 100),
    (v_version_id, 'referral', 'Referral', 'Referral to or from another provider', 110),
    (v_version_id, 'lab_case', 'Lab case', 'Dental lab case or appliance order', 120),
    (v_version_id, 'invoice', 'Invoice', 'Patient or insurance invoice', 130),
    (v_version_id, 'contract', 'Contract', 'Vendor, DSO, or payer contract', 140),
    (v_version_id, 'policy', 'Policy', 'Practice or compliance policy', 150),
    (v_version_id, 'task', 'Task', 'Follow-up or operational task', 160),
    (v_version_id, 'document', 'Document', 'Clinical or admin document', 170)
  on conflict (pack_version_id, key) do update set
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

  -- Relationship types
  insert into public.pack_relationship_types (
    pack_version_id, key, label, description, source_entity_type, target_entity_type, sort_order
  )
  values
    (v_version_id, 'EMPLOYS', 'Employs', 'Practice employs a provider', 'organization', 'provider', 10),
    (v_version_id, 'SERVES', 'Serves', 'Practice serves a patient', 'organization', 'patient', 20),
    (v_version_id, 'TREATS', 'Treats', 'Provider treats a patient', 'provider', 'patient', 30),
    (v_version_id, 'HAS_APPOINTMENT', 'Has appointment', 'Patient has an appointment', 'patient', 'appointment', 40),
    (v_version_id, 'SCHEDULED_WITH', 'Scheduled with', 'Appointment is with a provider', 'appointment', 'provider', 50),
    (v_version_id, 'HAS_TREATMENT_PLAN', 'Has treatment plan', 'Patient has a treatment plan', 'patient', 'treatment_plan', 60),
    (v_version_id, 'INCLUDES_TREATMENT', 'Includes treatment', 'Treatment plan includes a treatment', 'treatment_plan', 'treatment', 70),
    (v_version_id, 'PERFORMED_AT', 'Performed at', 'Treatment performed at an appointment', 'treatment', 'appointment', 80),
    (v_version_id, 'CLAIM_FOR', 'Claim for', 'Insurance claim is for a treatment', 'claim', 'treatment', 90),
    (v_version_id, 'INSURED_BY', 'Insured by', 'Patient is insured by a payer', 'patient', 'payer', 100),
    (v_version_id, 'SUBMITTED_TO', 'Submitted to', 'Claim submitted to a payer', 'claim', 'payer', 110),
    (v_version_id, 'REFERRED_TO', 'Referred to', 'Patient referred to a provider', 'patient', 'provider', 120),
    (v_version_id, 'REFERRED_BY', 'Referred by', 'Referral originated from a provider', 'referral', 'provider', 130),
    (v_version_id, 'LAB_CASE_FOR', 'Lab case for', 'Lab case is for a patient', 'lab_case', 'patient', 140),
    (v_version_id, 'CONTACT_FOR', 'Contact for', 'Person is a contact for a patient', 'person', 'patient', 150),
    (v_version_id, 'HAS_INVOICE', 'Has invoice', 'Patient has an invoice', 'patient', 'invoice', 160),
    (v_version_id, 'ASSIGNED_TO', 'Assigned to', 'Task assigned to a person', 'task', 'person', 170),
    (v_version_id, 'TASK_RELATES_TO', 'Relates to patient', 'Task relates to a patient', 'task', 'patient', 180),
    (v_version_id, 'APPLIES_TO', 'Applies to', 'Policy applies to the practice', 'policy', 'organization', 190)
  on conflict (pack_version_id, key) do update set
    label = excluded.label,
    description = excluded.description,
    source_entity_type = excluded.source_entity_type,
    target_entity_type = excluded.target_entity_type,
    sort_order = excluded.sort_order;

  -- Recommended Spaces
  insert into public.pack_spaces (
    pack_version_id, key, display_name, description, profile_type, default_selected, sort_order
  )
  values
    (v_version_id, 'patients', 'Patients', 'Patient records and correspondence', 'other', true, 10),
    (v_version_id, 'clinical', 'Clinical', 'Charts, treatment notes, and clinical docs', 'other', true, 20),
    (v_version_id, 'scheduling', 'Scheduling', 'Appointments and schedule materials', 'other', true, 30),
    (v_version_id, 'insurance_claims', 'Insurance & Claims', 'Payers, claims, and benefits docs', 'other', true, 40),
    (v_version_id, 'billing', 'Billing', 'Invoices, statements, and collections', 'other', true, 50),
    (v_version_id, 'providers', 'Providers', 'Provider credentials and team materials', 'other', false, 60),
    (v_version_id, 'compliance', 'Compliance', 'HIPAA, policies, and audits', 'other', false, 70)
  on conflict (pack_version_id, key) do update set
    display_name = excluded.display_name,
    description = excluded.description,
    profile_type = excluded.profile_type,
    default_selected = excluded.default_selected,
    sort_order = excluded.sort_order;

  -- Gideon skill
  insert into public.pack_gideon_skills (
    pack_version_id, key, name, description, prompt_addon, sort_order
  )
  values (
    v_version_id,
    'dental_practice_ops',
    'Dental Practice Ops',
    'Practice operations mode for patients, appointments, treatment plans, claims, and clinical follow-ups.',
    $prompt$
DENTAL PRACTICE OPS (Guardian Dental Pack):
You help the user run a dental practice using Guardian data.
Distinguish clearly between:
1) Known from Guardian data (ontology entities, relationships, evidence, documents, connected sources)
2) Gideon's recommendation (advisory judgment based on available context)

Never fabricate patient, clinical, insurance, or appointment facts. If evidence is thin, say what is known and what is missing.
Prefer citing evidence (document names, source items) when stating facts.
For "everything we know about [patient]" questions: give a concise practice summary (identity, providers, appointments, treatment plans, claims, tasks, sources) — not a raw extraction dump.
For scheduling and claim follow-up questions, reason over available structured data — do not invent appointment times, claim statuses, or payer decisions.
Never give definitive medical, clinical, or insurance advice. Stay operational (who, what, when, status, next admin step).
For advisory questions ("what should I follow up on?"), give practical next steps labeled as recommendations.
Protect privacy: do not invent PHI; only use facts present in Guardian context for this Space.
$prompt$,
    10
  )
  on conflict (pack_version_id, key) do update set
    name = excluded.name,
    description = excluded.description,
    prompt_addon = excluded.prompt_addon,
    sort_order = excluded.sort_order;

  -- Rules
  insert into public.pack_rules (pack_version_id, key, rule_type, definition, sort_order)
  values
    (
      v_version_id,
      'entity_resolution',
      'resolution',
      '{"strategy":"canonical_alias_fuzzy","fuzzy_types":["organization","patient","provider","payer","appointment","treatment_plan","claim"],"min_confidence":0.55}'::jsonb,
      10
    ),
    (
      v_version_id,
      'evidence_required',
      'extraction',
      '{"require_evidence_for_ai_relationships":true,"retain_document_and_chunk_refs":true}'::jsonb,
      20
    ),
    (
      v_version_id,
      'no_auto_analyze',
      'lifecycle',
      '{"analyze_existing_requires_explicit_user_action":true}'::jsonb,
      30
    ),
    (
      v_version_id,
      'dental_extraction_hints',
      'extraction',
      '{"prefer_entity_types":["patient","provider","appointment","treatment_plan","treatment","claim","payer","lab_case","referral"],"hint":"Extract dental practice entities: patients, providers, appointments, treatment plans, treatments/procedures, insurance claims, payers, referrals, and lab cases. Prefer specific relationship types (TREATS, HAS_APPOINTMENT, CLAIM_FOR, INSURED_BY) over RELATED_TO."}'::jsonb,
      40
    )
  on conflict (pack_version_id, key) do update set
    rule_type = excluded.rule_type,
    definition = excluded.definition,
    sort_order = excluded.sort_order;

  -- Starter questions
  delete from public.pack_starter_questions where pack_version_id = v_version_id;
  insert into public.pack_starter_questions (pack_version_id, question, skill_key, sort_order)
  values
    (v_version_id, 'Which patients have upcoming appointments?', 'dental_practice_ops', 10),
    (v_version_id, 'Show me everything we know about this patient.', 'dental_practice_ops', 20),
    (v_version_id, 'What insurance claims need follow-up?', 'dental_practice_ops', 30),
    (v_version_id, 'Which treatment plans are incomplete?', 'dental_practice_ops', 40),
    (v_version_id, 'Who is treating this patient?', 'dental_practice_ops', 50),
    (v_version_id, 'What lab cases are outstanding?', 'dental_practice_ops', 60),
    (v_version_id, 'Which claims were denied or are still pending?', 'dental_practice_ops', 70),
    (v_version_id, 'What appointments are scheduled this week?', 'dental_practice_ops', 80),
    (v_version_id, 'What tasks need attention in the practice?', 'dental_practice_ops', 90),
    (v_version_id, 'What should I follow up on today?', 'dental_practice_ops', 100);

  -- Dashboard cards
  insert into public.pack_dashboard_config (pack_version_id, cards)
  values (
    v_version_id,
    '[
      {"key":"follow_ups","title":"Needs follow-up","source":"follow_ups","empty":"Nothing urgent in tasks or claims right now."},
      {"key":"patients","title":"Patients","entityTypes":["patient"],"empty":"Analyze clinical and patient docs to discover patients."},
      {"key":"appointments","title":"Appointments","entityTypes":["appointment"],"empty":"Analyze scheduling materials to discover appointments."},
      {"key":"treatment_plans","title":"Treatment plans","entityTypes":["treatment_plan"],"empty":"Analyze clinical docs to discover treatment plans."},
      {"key":"claims","title":"Insurance claims","entityTypes":["claim"],"empty":"Analyze insurance docs to track claims."},
      {"key":"providers","title":"Providers","entityTypes":["provider"],"empty":"Analyze team materials to discover providers."},
      {"key":"lab_cases","title":"Lab cases","entityTypes":["lab_case"],"empty":"No lab cases discovered yet."},
      {"key":"tasks","title":"Tasks","entityTypes":["task"],"empty":"No tasks discovered yet."},
      {"key":"recent_knowledge","title":"Recent Knowledge","source":"recent_evidence","empty":"Analyze existing knowledge to populate this feed."},
      {"key":"ontology_health","title":"Ontology Health","source":"ontology_stats","empty":"Install and analyze to build your dental ontology."}
    ]'::jsonb
  )
  on conflict (pack_version_id) do update set
    cards = excluded.cards,
    updated_at = now();
end $$;
