import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { associateGuardianItem } from "./associate";
import { extractGuardianItemsWithLlm } from "./extract";
import { logGuardianEvent } from "./log";
import { isLowValueHistoricalFact } from "./negativeFilter";
import { persistExtractedGuardianItem } from "./persist";

/**
 * Run Guardian item extraction for a document after analysis/indexing/ontology.
 */
export async function processGuardianItemExtraction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  spaceId: string
): Promise<{
  created: number;
  deduped: number;
  lowConfidence: number;
  skipped: boolean;
}> {
  logGuardianEvent("guardian_extraction_started", {
    document_id: documentId,
    space_id: spaceId,
    user_id: userId,
  });

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, profile_id")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) {
    return { created: 0, deduped: 0, lowConfidence: 0, skipped: true };
  }

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select(
      "title, summary, document_type, source_text, important_dates, specialist"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  const sourceText = String(extracted?.source_text ?? "").trim();
  if (!sourceText) {
    logGuardianEvent("guardian_extraction_completed", {
      document_id: documentId,
      space_id: spaceId,
      created: 0,
      deduped: 0,
      low_confidence: 0,
      skipped: true,
      reason: "no_source_text",
    });
    return { created: 0, deduped: 0, lowConfidence: 0, skipped: true };
  }

  const { data: space } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type, parent_profile_id")
    .eq("id", spaceId)
    .maybeSingle();

  let childSpaces: { id: string; display_name: string }[] = [];
  const parentId = space?.parent_profile_id ?? spaceId;
  const { data: children } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type")
    .eq("parent_profile_id", parentId)
    .in("profile_type", ["child", "student"]);
  childSpaces = (children ?? []).map((c) => ({
    id: c.id,
    display_name: c.display_name,
  }));

  const importantDates = Array.isArray(extracted?.important_dates)
    ? (extracted.important_dates as {
        label?: string;
        date?: string;
        value?: string;
      }[])
    : null;

  const parsed = await extractGuardianItemsWithLlm({
    sourceText,
    fileName: doc.file_name ?? "document",
    documentType: extracted?.document_type,
    title: extracted?.title,
    summary: extracted?.summary,
    spaceName: space?.display_name,
    importantDates,
  });

  if (!parsed) {
    logGuardianEvent("guardian_extraction_completed", {
      document_id: documentId,
      space_id: spaceId,
      created: 0,
      deduped: 0,
      low_confidence: 0,
      skipped: true,
      reason: "parse_failed",
    });
    return { created: 0, deduped: 0, lowConfidence: 0, skipped: true };
  }

  const timeZone = await getUserTimeZone(supabase, userId);
  const today = calendarDateInUserZone(new Date(), timeZone);

  let created = 0;
  let deduped = 0;
  let lowConfidence = 0;

  for (const item of parsed.items) {
    if (isLowValueHistoricalFact(item)) {
      continue;
    }

    const association = associateGuardianItem(
      {
        userId,
        spaceId,
        spaceProfileType: space?.profile_type,
        spaceDisplayName: space?.display_name,
        childSpaces,
      },
      item.child_reference
    );

    const result = await persistExtractedGuardianItem({
      supabase,
      association,
      item,
      sourceDocumentId: documentId,
      sourceDocumentTitle: doc.file_name,
      today,
    });

    if (result.outcome === "created") created += 1;
    else if (result.outcome === "deduped") deduped += 1;
    else if (result.outcome === "low_confidence") lowConfidence += 1;
  }

  logGuardianEvent("guardian_extraction_completed", {
    document_id: documentId,
    space_id: spaceId,
    created,
    deduped,
    low_confidence: lowConfidence,
    item_count: parsed.items.length,
  });

  return { created, deduped, lowConfidence, skipped: false };
}
