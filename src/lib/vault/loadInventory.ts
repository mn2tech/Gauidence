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
  question: string,
  userId?: string
): Promise<string> {
  if (searchProfileIds.length === 0) {
    return "(no documents or photos uploaded in the active vault scope)";
  }

  const needsFullInventory = wantsVaultFileInventory(question);

  let vaultText: string;
  if (needsFullInventory) {
    const { data: vaultFileRows } = await supabase
      .from("documents")
      .select("file_name, mime_type, profile_id")
      .in("profile_id", searchProfileIds)
      .order("created_at", { ascending: false })
      .limit(250);

    vaultText = formatVaultFileListForGideon(vaultFileRows ?? [], profileNames);
  } else {
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

    vaultText = formatVaultFileSummaryForGideon(
      (recentRows ?? []) as VaultFileInventoryRow[],
      profileNames,
      countsByProfile
    );
  }

  const connected = userId
    ? await loadConnectedAnalyzedFilesForGideon(supabase, userId)
    : "";
  if (!connected) return vaultText;
  if (vaultText.startsWith("(no documents")) return connected;
  return `${vaultText}\n\n${connected}`;
}

async function loadConnectedAnalyzedFilesForGideon(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id, source_type, display_name")
    .eq("user_id", userId)
    .neq("status", "disconnected")
    .limit(20);
  if (!sources?.length) return "";

  const sourceIds = sources.map((s) => s.id as string);
  const { data: items } = await supabase
    .from("source_items")
    .select("id, name, mime_type, processing_status, source_id, metadata")
    .in("source_id", sourceIds)
    .eq("processing_status", "analyzed")
    .order("updated_at", { ascending: false })
    .limit(40);
  if (!items?.length) return "";

  const sourceById = new Map(
    sources.map((s) => [s.id as string, s] as const)
  );
  const lines = [
    "CONNECTED FILES (analyzed Trello / Device Storage — these are available even if they are not uploaded into the space):",
  ];
  for (const item of items) {
    const src = sourceById.get(item.source_id as string);
    const kind = src?.source_type === "trello" ? "Trello" : "Device Storage";
    const meta =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {};
    const card =
      typeof meta.cardName === "string" && meta.cardName.trim()
        ? ` · ${meta.cardName.trim()}`
        : "";
    lines.push(`- ${String(item.name ?? "file")}${card} (${kind}, analyzed)`);
  }
  return lines.join("\n");
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
