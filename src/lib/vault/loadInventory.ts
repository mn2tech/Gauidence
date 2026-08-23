import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatVaultFileListForGideon,
  formatVaultFileSummaryForGideon,
  formatBoundConnectedFilesForGideon,
  wantsVaultFileInventory,
  wantsSongOrChartList,
  chartFileTypeListFilter,
  RECENT_VAULT_FILE_PREVIEW,
  summarizeConnectedPracticeItems,
  formatConnectedPracticeStatsLine,
  looksLikeSongOrChartTitle,
  type VaultFileInventoryRow,
  type ConnectedPracticeStats,
} from "./askInventory";
import {
  getCachedProfileFileCounts,
  setCachedProfileFileCounts,
} from "./inventoryCache";
import { chartSuggestionTitle } from "./gideon";
import {
  itemBelongsToTrelloBoard,
  trelloSelectedBoardId,
  trelloSelectedBoardName,
} from "@/lib/connectors/trello/selectedBoard";

export type ConnectedSuggestionContext = {
  chartCount: number;
  songTitles: string[];
  boardName: string | null;
  hasConnectedCharts: boolean;
  practiceStats: ConnectedPracticeStats | null;
  practiceStatsLine: string | null;
};

/** Analyzed Trello/device charts bound to a space — for Ask Gideon chips. */
export async function loadConnectedSuggestionContext(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<ConnectedSuggestionContext> {
  const empty: ConnectedSuggestionContext = {
    chartCount: 0,
    songTitles: [],
    boardName: null,
    hasConnectedCharts: false,
    practiceStats: null,
    practiceStatsLine: null,
  };

  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id, source_type, display_name, profile_id, settings")
    .eq("profile_id", profileId)
    .neq("status", "disconnected")
    .limit(20);
  if (!sources?.length) return empty;

  // Only sources explicitly bound to this space (not every unbound connector).
  const relevant = sources;
  if (!relevant.length) return empty;

  const sourceIds = relevant.map((s) => s.id as string);
  const boardBySource = new Map(
    relevant.map((source) => {
      const settings =
        source.settings && typeof source.settings === "object"
          ? (source.settings as Record<string, unknown>)
          : {};
      return [source.id as string, trelloSelectedBoardId(settings)] as const;
    })
  );

  const { data: items } = await supabase
    .from("source_items")
    .select("id, name, mime_type, processing_status, source_id, external_id, metadata")
    .in("source_id", sourceIds)
    .eq("processing_status", "analyzed")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (!items?.length) return empty;

  const onSelectedBoard = items.filter((item) => {
    const src = relevant.find((s) => s.id === item.source_id);
    if (!src || src.source_type !== "trello") return true;
    const selectedBoardId = boardBySource.get(item.source_id as string) ?? null;
    if (!selectedBoardId) return true;
    const meta =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {};
    return itemBelongsToTrelloBoard(
      {
        externalId: typeof item.external_id === "string" ? item.external_id : undefined,
        processingStatus: "analyzed",
        metadata: meta,
      },
      selectedBoardId
    );
  });
  if (!onSelectedBoard.length) return empty;

  const practiceStats = summarizeConnectedPracticeItems(
    onSelectedBoard.map((item) => ({
      name: typeof item.name === "string" ? item.name : null,
      mime_type: typeof item.mime_type === "string" ? item.mime_type : null,
      metadata:
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : null,
    }))
  );

  let boardName: string | null = null;
  for (const source of relevant) {
    if (source.source_type !== "trello") continue;
    const settings =
      source.settings && typeof source.settings === "object"
        ? (source.settings as Record<string, unknown>)
        : {};
    if (trelloSelectedBoardId(settings)) {
      boardName = trelloSelectedBoardName(settings);
      if (boardName) break;
    }
  }

  // Prefer chip titles from the stats helper; fall back to chartSuggestionTitle.
  const songTitles =
    practiceStats.songTitles.length > 0
      ? practiceStats.songTitles.slice(0, 4)
      : (() => {
          const titles: string[] = [];
          const seen = new Set<string>();
          for (const item of onSelectedBoard) {
            const meta =
              item.metadata && typeof item.metadata === "object"
                ? (item.metadata as Record<string, unknown>)
                : {};
            const title = chartSuggestionTitle({
              name: typeof item.name === "string" ? item.name : null,
              cardName: typeof meta.cardName === "string" ? meta.cardName : null,
            });
            if (!title) continue;
            const key = title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            titles.push(title);
            if (titles.length >= 4) break;
          }
          return titles;
        })();

  return {
    chartCount: practiceStats.chartCount,
    songTitles: songTitles.filter((title) => looksLikeSongOrChartTitle(title)),
    boardName,
    hasConnectedCharts: practiceStats.chartCount > 0,
    practiceStats,
    practiceStatsLine: formatConnectedPracticeStatsLine(practiceStats, boardName),
  };
}

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
    ? await loadBoundConnectedFilesForGideon(
        supabase,
        userId,
        searchProfileIds,
        profileNames,
        {
          songList:
            wantsSongOrChartList(question) ||
            chartFileTypeListFilter(question) != null,
        }
      )
    : "";
  if (!connected) return vaultText;
  if (vaultText.startsWith("(no documents")) return connected;
  return `${vaultText}\n\n${connected}`;
}

async function loadBoundConnectedFilesForGideon(
  supabase: SupabaseClient,
  userId: string,
  spaceIds: string[],
  profileNames: Record<string, string>,
  options?: { songList?: boolean }
): Promise<string> {
  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id, source_type, display_name, profile_id, settings")
    .in("profile_id", spaceIds)
    .neq("status", "disconnected")
    .limit(20);
  if (!sources?.length) return "";

  const relevant = sources;
  if (!relevant.length) return "";

  const sourceIds = relevant.map((s) => s.id as string);
  const boardBySource = new Map(
    relevant.map((source) => {
      const settings =
        source.settings && typeof source.settings === "object"
          ? (source.settings as Record<string, unknown>)
          : {};
      return [
        source.id as string,
        source.source_type === "trello"
          ? trelloSelectedBoardId(settings)
          : null,
      ] as const;
    })
  );

  const songList = Boolean(options?.songList);
  let query = supabase
    .from("source_items")
    .select(
      "id, name, mime_type, processing_status, source_id, external_id, metadata"
    )
    .in("source_id", sourceIds)
    .order("updated_at", { ascending: false })
    .limit(songList ? 400 : 80);

  if (songList) {
    query = query.neq("processing_status", "unavailable");
  } else {
    query = query.eq("processing_status", "analyzed");
  }

  const { data: items } = await query;
  if (!items?.length) return "";

  const sourceById = new Map(
    relevant.map((s) => [s.id as string, s] as const)
  );
  const files = items
    .filter((item) => {
      const selectedBoardId = boardBySource.get(item.source_id as string);
      if (!selectedBoardId) return true;
      const meta =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      // itemBelongsToTrelloBoard rejects unavailable; for song lists we already
      // filtered those out, so pass analyzed so board metadata still matches.
      return itemBelongsToTrelloBoard(
        {
          externalId:
            typeof item.external_id === "string" ? item.external_id : undefined,
          processingStatus: "analyzed",
          metadata: meta,
        },
        selectedBoardId
      );
    })
    .filter((item) => {
      if (!songList) return true;
      const kind = String(
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>).kind ?? ""
          : ""
      );
      return kind === "attachment";
    })
    .map((item) => {
      const src = sourceById.get(item.source_id as string);
      const meta =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      return {
        name: String(item.name ?? "file"),
        cardName:
          typeof meta.cardName === "string" ? meta.cardName : null,
        sourceType: String(src?.source_type ?? ""),
        processingStatus: String(item.processing_status ?? "analyzed"),
        mimeType: typeof item.mime_type === "string" ? item.mime_type : null,
      };
    });
  if (!files.length) return "";

  const spaceNames = [
    ...new Set(
      relevant
        .map((s) => {
          const pid = s.profile_id as string | null;
          return pid ? profileNames[pid] : null;
        })
        .filter((n): n is string => Boolean(n))
    ),
  ];
  return formatBoundConnectedFilesForGideon(files, spaceNames);
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
