import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatVaultFileListForGideon,
  formatVaultFileSummaryForGideon,
  wantsVaultFileInventory,
  RECENT_VAULT_FILE_PREVIEW,
  type VaultFileInventoryRow,
} from "./askInventory";
import {
  getCachedProfileFileCounts,
  setCachedProfileFileCounts,
} from "./inventoryCache";

export async function loadVaultFileInventoryContext(
  supabase: SupabaseClient,
  searchProfileIds: string[],
  profileNames: Record<string, string>,
  question: string
): Promise<string> {
  if (searchProfileIds.length === 0) {
    return "(no documents or photos uploaded in the active vault scope)";
  }

  const needsFullInventory = wantsVaultFileInventory(question);

  if (needsFullInventory) {
    const { data: vaultFileRows } = await supabase
      .from("documents")
      .select("file_name, mime_type, profile_id")
      .in("profile_id", searchProfileIds)
      .order("created_at", { ascending: false })
      .limit(250);

    return formatVaultFileListForGideon(vaultFileRows ?? [], profileNames);
  }

  const countsByProfile = await loadProfileFileCounts(
    supabase,
    searchProfileIds
  );

  const { data: recentRows } = await supabase
    .from("documents")
    .select("file_name, mime_type, profile_id")
    .in("profile_id", searchProfileIds)
    .order("created_at", { ascending: false })
    .limit(RECENT_VAULT_FILE_PREVIEW * searchProfileIds.length);

  return formatVaultFileSummaryForGideon(
    (recentRows ?? []) as VaultFileInventoryRow[],
    profileNames,
    countsByProfile
  );
}

async function loadProfileFileCounts(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Record<string, number>> {
  const cached = getCachedProfileFileCounts(profileIds);
  if (cached) return cached;

  const counts: Record<string, number> = {};
  await Promise.all(
    profileIds.map(async (profileId) => {
      const { count } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId);
      counts[profileId] = count ?? 0;
    })
  );

  setCachedProfileFileCounts(profileIds, counts);
  return counts;
}
