import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";
import { profileMentionedInQuestion } from "@/lib/vault/detectVaultScope";
import {
  scoreLogRelevance,
  todayLogDate,
  type DailyLog,
} from "./types";

export type RetrievedDailyLogs = {
  logs: DailyLog[];
  authorNames: Record<string, string>;
};

function logsByMentionedAuthor(
  logs: DailyLog[],
  question: string,
  authorNames: Record<string, string>
): DailyLog[] {
  return logs.filter((log) => {
    const name = authorNames[log.owner_user_id];
    return name && profileMentionedInQuestion(question, name);
  });
}

function mentionedVaultProfileIds(
  question: string,
  profileIds: string[],
  profileNames?: Record<string, string>
): string[] {
  if (!profileNames) return [];
  return profileIds.filter((id) => {
    const name = profileNames[id]?.trim();
    return name && profileMentionedInQuestion(question, name);
  });
}

function mergeWithMentionedVaultLogs(
  selected: DailyLog[],
  allLogs: DailyLog[],
  mentionedVaultIds: string[],
  limit: number
): DailyLog[] {
  if (mentionedVaultIds.length === 0) return selected.slice(0, limit);

  const seen = new Set(selected.map((log) => log.id));
  const merged = [...selected];

  for (const vaultId of mentionedVaultIds) {
    for (const log of allLogs) {
      if (log.profile_id !== vaultId || seen.has(log.id)) continue;
      merged.push(log);
      seen.add(log.id);
      const vaultCount = merged.filter((row) => row.profile_id === vaultId).length;
      if (vaultCount >= 2) break;
    }
  }

  return merged.slice(0, limit);
}

/**
 * Retrieve relevant Daily Logs for one profile, or several (container rollup).
 * Access is enforced by RLS (shared vault members can read owner logs).
 */
export async function retrieveRelevantDailyLogs(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    /** When set, search these profiles instead of only profileId. */
    profileIds?: string[];
    /** Optional map of profile id → display name for attribution. */
    profileNames?: Record<string, string>;
    question: string;
    limit?: number;
  }
): Promise<RetrievedDailyLogs> {
  const limit = args.limit ?? 6;
  const today = todayLogDate();
  const windowStart = (() => {
    const d = new Date(`${today}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const scopeIds =
    args.profileIds && args.profileIds.length > 0
      ? args.profileIds
      : [args.profileId];

  let query = supabase
    .from("daily_logs")
    .select(
      "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at"
    )
    .gte("log_date", windowStart)
    .order("log_date", { ascending: false })
    .limit(Math.min(80 * scopeIds.length, 200));

  query =
    scopeIds.length === 1
      ? query.eq("profile_id", scopeIds[0]!)
      : query.in("profile_id", scopeIds);

  const { data, error } = await query;

  if (error || !data?.length) {
    return { logs: [], authorNames: {} };
  }

  const logs = data as DailyLog[];
  const ownerIds = [...new Set(logs.map((log) => log.owner_user_id))];
  const authorAccounts = await loadCollaboratorMemberAccounts(ownerIds);
  const authorNames = Object.fromEntries(
    ownerIds.map((id) => [
      id,
      collaboratorDisplayName(authorAccounts.get(id)),
    ])
  );

  const mentionedVaultIds = mentionedVaultProfileIds(
    args.question,
    scopeIds,
    args.profileNames
  );

  const scored = logs
    .map((log) => ({
      log,
      score:
        scoreLogRelevance(log, args.question, today, {
          authorName: authorNames[log.owner_user_id],
          vaultName: args.profileNames?.[log.profile_id],
        }) + (mentionedVaultIds.includes(log.profile_id) ? 4 : 0),
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.log.log_date.localeCompare(a.log.log_date)
    );

  if (scored.length > 0) {
    return {
      logs: mergeWithMentionedVaultLogs(
        scored.map((r) => r.log),
        logs,
        mentionedVaultIds,
        limit
      ),
      authorNames,
    };
  }

  const authorMatched = logsByMentionedAuthor(
    logs,
    args.question,
    authorNames
  );
  if (authorMatched.length > 0) {
    const vaultFiltered =
      mentionedVaultIds.length === 1
        ? authorMatched.filter((log) => log.profile_id === mentionedVaultIds[0])
        : authorMatched;
    return {
      logs: (vaultFiltered.length > 0 ? vaultFiltered : authorMatched).slice(
        0,
        limit
      ),
      authorNames,
    };
  }

  if (mentionedVaultIds.length === 1) {
    const vaultLogs = logs.filter(
      (log) => log.profile_id === mentionedVaultIds[0]
    );
    if (vaultLogs.length > 0) {
      return { logs: vaultLogs.slice(0, limit), authorNames };
    }
  }

  if (
    /today|yesterday|recent|log|what happened|update|follow|summar|remember|this week/i.test(
      args.question
    )
  ) {
    return { logs: logs.slice(0, Math.min(5, limit)), authorNames };
  }
  return { logs: logs.slice(0, Math.min(3, limit)), authorNames };
}

export function formatDailyLogsForGideon(
  logs: DailyLog[],
  profileNames?: Record<string, string>,
  authorNames?: Record<string, string>
): string {
  if (logs.length === 0) return "";
  return logs
    .map((log) => {
      const tags =
        Array.isArray(log.tags) && log.tags.length
          ? ` | tags: ${log.tags.join(", ")}`
          : "";
      const title = log.title?.trim() ? ` | title: ${log.title.trim()}` : "";
      const cat = log.category ? ` | category: ${log.category}` : "";
      const vaultLabel =
        profileNames?.[log.profile_id]?.trim() ||
        (profileNames ? "linked vault" : "");
      const vault = vaultLabel ? ` | vault: ${vaultLabel}` : "";
      const author = authorNames?.[log.owner_user_id]?.trim();
      const addedBy = author ? ` | added by: ${author}` : "";
      return `[Daily Log ${log.log_date}${vault}${addedBy}${title}${cat}${tags}]\n${log.content}`;
    })
    .join("\n\n---\n\n");
}
