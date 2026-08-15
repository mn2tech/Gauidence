-- Refresh Business Pack dashboard card definitions for live attention cards.
-- Safe to re-run: updates pack_dashboard_config for guardian-business 1.0.0.

do $$
declare
  v_version_id uuid;
begin
  select pv.id into v_version_id
  from public.pack_versions pv
  join public.packs p on p.id = pv.pack_id
  where p.slug = 'guardian-business'
    and pv.version = '1.0.0'
  limit 1;

  if v_version_id is null then
    raise notice 'guardian-business 1.0.0 not found — skip dashboard card refresh';
    return;
  end if;

  insert into public.pack_dashboard_config (pack_version_id, cards)
  values (
    v_version_id,
    '[
      {"key":"follow_ups","title":"Needs follow-up","source":"follow_ups","empty":"Nothing urgent in open proposals or tasks right now."},
      {"key":"clients","title":"Clients","entityTypes":["client","organization"],"empty":"Connect or analyze business knowledge to discover your clients."},
      {"key":"open_proposals","title":"Open Proposals","source":"proposals","empty":"No open proposals yet."},
      {"key":"expiring_contracts","title":"Contracts expiring soon","source":"expiring_contracts","entityTypes":["contract"],"empty":"No contract end dates found in the next 90 days."},
      {"key":"contracts","title":"Contracts","entityTypes":["contract"],"empty":"Analyze contracts to track agreements."},
      {"key":"active_projects","title":"Active Projects","entityTypes":["project"],"empty":"Analyze proposals and documents to discover projects."},
      {"key":"tasks","title":"Tasks","entityTypes":["task"],"empty":"No tasks discovered yet."},
      {"key":"recent_knowledge","title":"Recent Knowledge","source":"recent_evidence","empty":"Analyze existing knowledge to populate this feed."},
      {"key":"ontology_health","title":"Ontology Health","source":"ontology_stats","empty":"Install and analyze to build your business ontology."}
    ]'::jsonb
  )
  on conflict (pack_version_id) do update set
    cards = excluded.cards,
    updated_at = now();
end $$;
