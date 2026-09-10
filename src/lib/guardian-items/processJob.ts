import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { associateGuardianItem } from "./associate";
import { extractGuardianItemsWithLlm } from "./extract";
import {
  guardianItemsFromImportantDates,
  guardianItemsFromSourceText,
} from "./fromImportantDates";
import { logGuardianEvent } from "./log";
import { collapseNearDuplicateExtractedItems } from "./dedupe";
import { isLowValueHistoricalFact } from "./negativeFilter";
import { persistExtractedGuardianItem } from "./persist";
import type { GuardianExtractedItem } from "./schema";
import {
  buildNewsletterReviewSummary,
  classifySchoolNewsletter,
  extractSchoolNewsletterItems,
} from "./newsletter";
import { SCHOOL_NEWSLETTER_DOCUMENT_TYPE } from "./types";

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
  newsletterReview?: ReturnType<typeof buildNewsletterReviewSummary> | null;
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

  const { data: extracted, error: extractedError } = await supabase
    .from("extracted_data")
    .select(
      "title, summary, document_type, source_text, specialist, vision_transcription, vision_summary"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (extractedError) {
    logGuardianEvent("guardian_extraction_completed", {
      document_id: documentId,
      space_id: spaceId,
      created: 0,
      deduped: 0,
      low_confidence: 0,
      skipped: true,
      reason: "extracted_data_query_failed",
      error: extractedError.message,
    });
    return { created: 0, deduped: 0, lowConfidence: 0, skipped: true };
  }

  const sourceText = [
    ...new Set(
      [
        extracted?.source_text,
        extracted?.vision_transcription,
        extracted?.vision_summary,
        extracted?.summary,
        extracted?.title,
      ]
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0)
    ),
  ].join("\n\n");

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

  const specialist = (extracted?.specialist ?? {}) as {
    important_dates?: {
      label?: string;
      date?: string;
      value?: string;
    }[];
  };
  const importantDates = Array.isArray(specialist.important_dates)
    ? specialist.important_dates
    : null;

  const timeZone = await getUserTimeZone(supabase, userId);
  const today = calendarDateInUserZone(new Date(), timeZone);

  const newsletterClass = classifySchoolNewsletter({
    sourceText,
    title: extracted?.title,
    fileName: doc.file_name,
    documentType: extracted?.document_type,
  });

  const isNewsletter =
    newsletterClass.isSchoolNewsletter ||
    extracted?.document_type === SCHOOL_NEWSLETTER_DOCUMENT_TYPE;

  if (isNewsletter) {
    await supabase
      .from("documents")
      .update({
        newsletter_classification_confidence: newsletterClass.confidence,
        newsletter_extraction_status: "processing",
      })
      .eq("id", documentId);

    if (
      extracted?.document_type !== SCHOOL_NEWSLETTER_DOCUMENT_TYPE &&
      newsletterClass.confidence >= 0.45
    ) {
      await supabase
        .from("extracted_data")
        .update({ document_type: SCHOOL_NEWSLETTER_DOCUMENT_TYPE })
        .eq("document_id", documentId);
    }
  }

  let merged: GuardianExtractedItem[] = [];
  let newsletterReview: ReturnType<typeof buildNewsletterReviewSummary> | null =
    null;

  if (isNewsletter) {
    const newsletter = extractSchoolNewsletterItems({
      sourceText,
      title: extracted?.title,
      today,
    });
    merged = [...newsletter.items];

    // Supplement with LLM for anything the deterministic pass missed
    try {
      const parsed = await extractGuardianItemsWithLlm({
        sourceText,
        fileName: doc.file_name ?? "document",
        documentType: SCHOOL_NEWSLETTER_DOCUMENT_TYPE,
        title: extracted?.title,
        summary: extracted?.summary,
        spaceName: space?.display_name,
        importantDates,
        newsletterMode: true,
        publicationDate: newsletter.meta.publicationDate,
        homeworkWeekStart: newsletter.meta.homeworkWeekStart,
      });
      if (parsed?.items?.length) {
        for (const item of parsed.items) {
          merged.push({
            ...item,
            metadata: {
              ...(item.metadata ?? {}),
              newsletter: true,
              publication_date: newsletter.meta.publicationDate,
            },
          });
        }
      }
    } catch (err) {
      console.error(
        "Newsletter LLM supplement failed (deterministic items retained):",
        err instanceof Error ? err.message : err
      );
    }
  } else {
    const seeded = guardianItemsFromImportantDates({
      dates: importantDates,
      title: extracted?.title,
      summary: extracted?.summary,
      today,
    });
    if (seeded.length === 0) {
      seeded.push(
        ...guardianItemsFromSourceText({
          sourceText,
          title: extracted?.title,
          summary: extracted?.summary,
          today,
        })
      );
    }

    const parsed = await extractGuardianItemsWithLlm({
      sourceText,
      fileName: doc.file_name ?? "document",
      documentType: extracted?.document_type,
      title: extracted?.title,
      summary: extracted?.summary,
      spaceName: space?.display_name,
      importantDates,
    });

    merged = [...seeded];
    if (parsed?.items?.length) {
      for (const item of parsed.items) merged.push(item);
    }
  }

  if (merged.length === 0) {
    if (isNewsletter) {
      await supabase
        .from("documents")
        .update({ newsletter_extraction_status: "skipped" })
        .eq("id", documentId);
    }
    logGuardianEvent("guardian_extraction_completed", {
      document_id: documentId,
      space_id: spaceId,
      created: 0,
      deduped: 0,
      low_confidence: 0,
      skipped: true,
      reason: "no_items",
      newsletter: isNewsletter,
    });
    return { created: 0, deduped: 0, lowConfidence: 0, skipped: true };
  }

  const filtered = merged.filter((item) => !isLowValueHistoricalFact(item));
  const collapsed = collapseNearDuplicateExtractedItems(filtered);

  let created = 0;
  let deduped = 0;
  let lowConfidence = 0;
  let associatedChildId: string | null = null;
  let associatedChildName: string | null = null;

  for (const item of collapsed) {
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

    if (association.childId) {
      associatedChildId = association.childId;
      associatedChildName =
        childSpaces.find((c) => c.id === association.childId)?.display_name ??
        (space?.profile_type === "child" || space?.profile_type === "student"
          ? space.display_name
          : null);
    }

    const forceNeedsReview =
      isNewsletter &&
      !association.childId &&
      childSpaces.length !== 1;

    const result = await persistExtractedGuardianItem({
      supabase,
      association,
      item,
      sourceDocumentId: documentId,
      sourceDocumentTitle: doc.file_name,
      today,
      allowSupersession: isNewsletter,
      forceNeedsReview,
    });

    if (result.outcome === "created" || result.outcome === "superseded")
      created += 1;
    else if (result.outcome === "deduped") deduped += 1;
    else if (result.outcome === "low_confidence") lowConfidence += 1;
  }

  if (isNewsletter) {
    // If exactly one child space exists under the family, association may still
    // be null when uploading to a parent space without an explicit reference.
    // Never invent — leave confirmation unless leaf child space upload.
    const meta = extractSchoolNewsletterItems({
      sourceText,
      title: extracted?.title,
      today,
    }).meta;

    newsletterReview = buildNewsletterReviewSummary({
      items: collapsed,
      meta,
      childName: associatedChildName,
      childId: associatedChildId,
    });

    await supabase
      .from("documents")
      .update({
        newsletter_extraction_status: newsletterReview.needsChildConfirmation
          ? "needs_confirmation"
          : "completed",
        newsletter_classification_confidence: newsletterClass.confidence,
      })
      .eq("id", documentId);
  }

  logGuardianEvent("guardian_extraction_completed", {
    document_id: documentId,
    space_id: spaceId,
    created,
    deduped,
    low_confidence: lowConfidence,
    item_count: collapsed.length,
    merged_count: merged.length,
    filtered_out: merged.length - filtered.length,
    collapsed_from: filtered.length,
    newsletter: isNewsletter,
  });

  return {
    created,
    deduped,
    lowConfidence,
    skipped: false,
    newsletterReview,
  };
}
