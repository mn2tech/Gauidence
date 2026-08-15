import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PackDashboardConfigRow,
  PackDefinition,
  PackEntityTypeRow,
  PackGideonSkillRow,
  PackListItem,
  PackRelationshipTypeRow,
  PackRow,
  PackRuleRow,
  PackSpaceRow,
  PackStarterQuestionRow,
  PackVersionRow,
  ProfilePackRow,
} from "./types";

const PACK_SELECT =
  "id, slug, name, description, category, status, pack_number, created_at, updated_at";
const VERSION_SELECT =
  "id, pack_id, version, changelog, status, published_at, created_at, updated_at";

export async function listPacks(
  supabase: SupabaseClient,
  profileId?: string | null
): Promise<PackListItem[]> {
  const { data: packs, error } = await supabase
    .from("packs")
    .select(PACK_SELECT)
    .in("status", ["available", "deprecated"])
    .order("pack_number", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  const packRows = (packs ?? []) as PackRow[];
  if (!packRows.length) return [];

  const packIds = packRows.map((p) => p.id);
  const { data: versions } = await supabase
    .from("pack_versions")
    .select(VERSION_SELECT)
    .in("pack_id", packIds)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const latestByPack = new Map<string, PackVersionRow>();
  for (const v of (versions ?? []) as PackVersionRow[]) {
    if (!latestByPack.has(v.pack_id)) latestByPack.set(v.pack_id, v);
  }

  let installsByPack = new Map<string, ProfilePackRow>();
  if (profileId) {
    const { data: installs } = await supabase
      .from("profile_packs")
      .select(
        "id, profile_id, pack_id, pack_version_id, status, installed_at, installed_by, updated_at, configuration"
      )
      .eq("profile_id", profileId)
      .in("pack_id", packIds);
    for (const row of (installs ?? []) as ProfilePackRow[]) {
      installsByPack.set(row.pack_id, row);
    }
  }

  return packRows.map((pack) => ({
    pack,
    latestVersion: latestByPack.get(pack.id) ?? null,
    installation: installsByPack.get(pack.id) ?? null,
  }));
}

export async function getPackBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PackRow | null> {
  const { data, error } = await supabase
    .from("packs")
    .select(PACK_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PackRow | null) ?? null;
}

export async function getPublishedVersion(
  supabase: SupabaseClient,
  packId: string,
  version?: string
): Promise<PackVersionRow | null> {
  let query = supabase
    .from("pack_versions")
    .select(VERSION_SELECT)
    .eq("pack_id", packId)
    .eq("status", "published");

  if (version) {
    query = query.eq("version", version);
  } else {
    query = query.order("published_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PackVersionRow | null) ?? null;
}

export async function loadPackDefinition(
  supabase: SupabaseClient,
  slug: string,
  version?: string
): Promise<PackDefinition | null> {
  const pack = await getPackBySlug(supabase, slug);
  if (!pack) return null;
  const packVersion = await getPublishedVersion(supabase, pack.id, version);
  if (!packVersion) return null;

  const versionId = packVersion.id;
  const [
    entityTypes,
    relationshipTypes,
    spaces,
    gideonSkills,
    rules,
    starterQuestions,
    dashboard,
  ] = await Promise.all([
    supabase
      .from("pack_entity_types")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_relationship_types")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_spaces")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_gideon_skills")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_rules")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_starter_questions")
      .select("*")
      .eq("pack_version_id", versionId)
      .order("sort_order"),
    supabase
      .from("pack_dashboard_config")
      .select("*")
      .eq("pack_version_id", versionId)
      .maybeSingle(),
  ]);

  return {
    pack,
    version: packVersion,
    entityTypes: (entityTypes.data ?? []) as PackEntityTypeRow[],
    relationshipTypes: (relationshipTypes.data ??
      []) as PackRelationshipTypeRow[],
    spaces: (spaces.data ?? []) as PackSpaceRow[],
    gideonSkills: (gideonSkills.data ?? []) as PackGideonSkillRow[],
    rules: (rules.data ?? []) as PackRuleRow[],
    starterQuestions: (starterQuestions.data ??
      []) as PackStarterQuestionRow[],
    dashboard: (dashboard.data as PackDashboardConfigRow | null) ?? null,
  };
}

export async function getInstalledPack(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string
): Promise<{ installation: ProfilePackRow; definition: PackDefinition } | null> {
  const pack = await getPackBySlug(supabase, packSlug);
  if (!pack) return null;

  const { data: installation } = await supabase
    .from("profile_packs")
    .select(
      "id, profile_id, pack_id, pack_version_id, status, installed_at, installed_by, updated_at, configuration"
    )
    .eq("profile_id", profileId)
    .eq("pack_id", pack.id)
    .eq("status", "installed")
    .maybeSingle();

  if (!installation) return null;

  const definition = await loadPackDefinition(supabase, packSlug);
  if (!definition) return null;

  return {
    installation: installation as ProfilePackRow,
    definition,
  };
}

/** True when the Space has Guardian Business (or any pack) installed. */
export async function profileHasInstalledPack(
  supabase: SupabaseClient,
  profileId: string,
  packSlug?: string
): Promise<boolean> {
  if (packSlug) {
    const installed = await getInstalledPack(supabase, profileId, packSlug);
    return Boolean(installed);
  }
  const { count } = await supabase
    .from("profile_packs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "installed");
  return (count ?? 0) > 0;
}
