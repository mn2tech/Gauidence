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

export type ChatTextExtractionResult = {
  attempted: boolean;
  created: number;
  deduped: number;
  lowConfidence: number;
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
    return { attempted: false, created: 0, deduped: 0, lowConfidence: 0 };
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
  let created = 0;
  let deduped = 0;
  let lowConfidence = 0;

  for (const item of items) {
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
  }

  return { attempted: true, created, deduped, lowConfidence };
}
