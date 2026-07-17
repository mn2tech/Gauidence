import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHomes,
  canHaveLinkedPets,
  canHaveLinkedVehicles,
  isGroupStyleProfile,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import { retrieveVaultChunks } from "./indexDocument";
import type { RetrievedChunk } from "./retrieve";

export type LinkedVaultProfile = {
  id: string;
  display_name: string;
  profile_type: GuardianProfileType;
};

/** Family / Business / Nonprofit / Vehicles containers roll up linked vaults. */
export function canRollupLinkedVaultSearch(
  type: GuardianProfileType
): boolean {
  return isGroupStyleProfile(type);
}

function linkedTypesForParent(
  parentType: GuardianProfileType
): GuardianProfileType[] {
  const types: GuardianProfileType[] = [];
  if (canHaveLinkedEmployees(parentType)) types.push("employee");
  if (canHaveLinkedClients(parentType)) types.push("client");
  if (canHaveLinkedFamilyMembers(parentType)) {
    types.push(
      "child",
      "spouse_partner",
      "parent",
      "family_member",
      "student"
    );
  }
  if (canHaveLinkedPets(parentType)) types.push("pet");
  if (canHaveLinkedHomes(parentType)) types.push("home");
  if (canHaveLinkedVehicles(parentType)) types.push("vehicle");
  return types;
}

/** Linked member/home/vehicle profiles under a container (for Gideon rollup). */
export async function listLinkedProfilesForVaultRollup(
  supabase: SupabaseClient,
  userId: string,
  parent: { id: string; profile_type: GuardianProfileType }
): Promise<LinkedVaultProfile[]> {
  if (!canRollupLinkedVaultSearch(parent.profile_type)) return [];
  const types = linkedTypesForParent(parent.profile_type);
  if (types.length === 0) return [];

  const { data, error } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type")
    .eq("parent_profile_id", parent.id)
    .in("profile_type", types)
    .order("display_name", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    display_name: String(row.display_name ?? "Profile"),
    profile_type: row.profile_type as GuardianProfileType,
  }));
}

/**
 * Search the active container vault plus each linked member vault, then merge
 * by similarity. Each chunk is tagged with the vault owner's display name.
 */
export async function retrieveVaultChunksAcrossProfiles(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  scopes: LinkedVaultProfile[],
  matchCount = 10
): Promise<RetrievedChunk[]> {
  if (scopes.length === 0) return [];

  const perProfile = Math.max(
    3,
    Math.ceil(matchCount / Math.min(scopes.length, 4))
  );

  const batches = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const rows = await retrieveVaultChunks(
          supabase,
          queryEmbedding,
          scope.id,
          perProfile
        );
        return rows.map((row) => ({
          ...row,
          profile_id: scope.id,
          profile_name: scope.display_name,
        }));
      } catch {
        return [] as RetrievedChunk[];
      }
    })
  );

  return batches
    .flat()
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
}
