import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { associateGuardianItem } from "./associate";
import { shouldExtractGuardianItemsFromChatText } from "./chatText";
import { collapseNearDuplicateExtractedItems } from "./dedupe";
import { extractGuardianItemsWithLlm } from "./extract";
import { isLowValueHistoricalFact } from "./negativeFilter";
import { persistExtractedGuardianItem } from "./persist";
import { completeGuardianItem } from "./actions";
import {
  reconcileItemWithDailyLogs,
  type RecentDailyLog,
} from "./reconcileDailyLogs";

export type ChatTextExtractionResult = {
  attempted: boolean;
  created: number;
  deduped: number;
  lowConfidence: number;
  reconciliationNotes: string[];
};

/** Turn substantive pasted chat text into Today/Watch items with chat provenance. */
export async function processChatTextGuardianItems(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId: string;
    messageId: string;
    text: string;
    spaceName?: string | null;
    spaceProfileType?: string | null;
  }
): Promise<ChatTextExtractionResult> {
  if (!shouldExtractGuardianItemsFromChatText(args.text)) {
    return {
      attempted: false,
      created: 0,
      deduped: 0,
      lowConfidence: 0,
      reconciliationNotes: [],
    };
  }

  const timeZone = await getUserTimeZone(supabase, args.userId);
  const today = calendarDateInUserZone(new Date(), timeZone);
  const { data: children } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", args.spaceId)
    .in("profile_type", ["child", "student"]);

  const parsed = await extractGuardianItemsWithLlm({
    sourceText: args.text,
    fileName: "Gideon pasted text",
    documentType: "pasted_email_or_text",
    title: "Information pasted into Gideon",
    spaceName: args.spaceName,
    referenceDate: today,
  });

  const items = collapseNearDuplicateExtractedItems(
    (parsed?.items ?? []).filter((item) => !isLowValueHistoricalFact(item))
  );
  const recentSince = new Date();
  recentSince.setUTCDate(recentSince.getUTCDate() - 30);
  const { data: recentLogRows } = await supabase
    .from("daily_logs")
    .select("id, title, content, log_date")
    .eq("profile_id", args.spaceId)
    .gte("log_date", recentSince.toISOString().slice(0, 10))
    .order("log_date", { ascending: false })
    .limit(20);
  const recentLogs = (recentLogRows ?? []) as RecentDailyLog[];
  let created = 0;
  let deduped = 0;
  let lowConfidence = 0;
  const reconciliationNotes: string[] = [];

  for (const item of items) {
    const reconciliation = reconcileItemWithDailyLogs(item, recentLogs);
    const association = associateGuardianItem(
      {
        userId: args.userId,
        spaceId: args.spaceId,
        spaceProfileType: args.spaceProfileType,
        spaceDisplayName: args.spaceName,
        childSpaces: (children ?? []).map((child) => ({
          id: child.id,
          display_name: child.display_name,
        })),
      },
      item.child_reference
    );
    const result = await persistExtractedGuardianItem({
      supabase,
      association,
      item,
      sourceDocumentId: null,
      sourceType: "chat",
      sourceId: args.messageId,
      today,
      allowSupersession: false,
    });
    if (result.outcome === "created" || result.outcome === "superseded") created += 1;
    else if (result.outcome === "deduped") deduped += 1;
    else if (result.outcome === "low_confidence") lowConfidence += 1;

    if (
      reconciliation.completedBy &&
      (result.outcome === "created" ||
        result.outcome === "deduped" ||
        result.outcome === "superseded")
    ) {
      await completeGuardianItem(supabase, result.id);
      reconciliationNotes.push(
        reconciliation.followUp
          ? `A recent Daily Log proves that \"${item.title}\" is already complete. Do not suggest drafting, sending, or saving the response again. The remaining action is: \"${reconciliation.followUp.title}\".`
          : `A recent Daily Log proves that \"${item.title}\" is already complete. Do not suggest doing or recording it again.`
      );
    }

    if (reconciliation.followUp) {
      const followUpResult = await persistExtractedGuardianItem({
        supabase,
        association,
        item: reconciliation.followUp,
        sourceDocumentId: null,
        sourceType: "daily_log",
        sourceId: reconciliation.completedBy!.id,
        today,
        allowSupersession: false,
      });
      if (
        followUpResult.outcome === "created" ||
        followUpResult.outcome === "superseded"
      ) created += 1;
      else if (followUpResult.outcome === "deduped") deduped += 1;
      else if (followUpResult.outcome === "low_confidence") lowConfidence += 1;
    }
  }

  return {
    attempted: true,
    created,
    deduped,
    lowConfidence,
    reconciliationNotes,
  };
}
