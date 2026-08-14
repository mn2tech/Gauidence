import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureDefaultGuardianProfile } from "@/lib/profiles/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import type { SourceContent } from "@/lib/connectors/content/types";
import { isAnalyzeSupportedMime } from "@/lib/connectors/content/types";
import {
  connectorAnalysisVersion,
  extractOntologyFromSourceContent,
} from "./extractFromSourceContent";
import { fallbackOntologyFromFileName } from "./filenameFallback";
import { mergeTrelloAttachmentOntoSong } from "./trelloCardIndex";
import {
  listOntologyForSourceItem,
  persistConnectorOntologyExtraction,
  rehomeConnectorOntologyToSpace,
} from "./persistConnectorOntology";
import type { OntologyPersistStats } from "../types";

export type AnalyzeSourceItemResult = {
  skipped: boolean;
  reason?: string;
  profileId: string;
  stats: OntologyPersistStats;
  entitiesFound: number;
  relationshipsFound: number;
  confidenceLabel: "High" | "Medium" | "Low" | "None";
  analysisVersion: string;
  entities: Awaited<ReturnType<typeof listOntologyForSourceItem>>["entities"];
  relationships: Awaited<
    ReturnType<typeof listOntologyForSourceItem>
  >["relationships"];
};

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Analyze a connected source item into ontology without storing the file.
 */
export async function analyzeSourceItem(
  supabase: SupabaseClient,
  args: {
    user: User;
    sourceId: string;
    itemId: string;
    content: SourceContent;
    contentHash: string;
    profileId?: string | null;
    force?: boolean;
  }
): Promise<AnalyzeSourceItemResult> {
  const version = connectorAnalysisVersion();

  const { data: source } = await supabase
    .from("connected_sources")
    .select("id, user_id, profile_id, status, source_type")
    .eq("id", args.sourceId)
    .eq("user_id", args.user.id)
    .maybeSingle();

  if (!source) {
    throw new AnalyzeError("not_found", "Connection not found.");
  }
  if (source.status === "disconnected" || source.status === "permission_revoked") {
    throw new AnalyzeError(
      "permission_revoked",
      "Guardian no longer has access to this folder."
    );
  }

  const { data: item } = await supabase
    .from("source_items")
    .select(
      "id, source_id, name, mime_type, processing_status, content_hash, analysis_version, metadata"
    )
    .eq("id", args.itemId)
    .eq("source_id", args.sourceId)
    .maybeSingle();

  if (!item) {
    throw new AnalyzeError("not_found", "File not found.");
  }

  if (item.processing_status === "unavailable") {
    throw new AnalyzeError(
      "unavailable",
      "This file is marked unavailable. Scan again after reconnecting the folder."
    );
  }

  if (
    !isAnalyzeSupportedMime(args.content.mimeType, args.content.filename)
  ) {
    throw new AnalyzeError(
      "unsupported",
      "This file type isn't supported for Analyze yet."
    );
  }

  const byteLength = args.content.bytes?.byteLength ?? 0;
  if (byteLength > MAX_BYTES) {
    throw new AnalyzeError(
      "too_large",
      "This file is too large to analyze right now (15 MB limit)."
    );
  }

  // Trello must land in the bound space so Ask Gideon in that space can see it.
  let profileId =
    (source.source_type === "trello" ? source.profile_id : null) ||
    args.profileId ||
    source.profile_id ||
    null;
  if (profileId) {
    const editable = await requireEditableGuardianProfile(
      supabase,
      args.user.id,
      profileId
    );
    if (!editable) {
      throw new AnalyzeError(
        "forbidden",
        "You don't have permission to write ontology in that space."
      );
    }
  } else {
    const profile = await ensureDefaultGuardianProfile(supabase, args.user);
    if (!profile) {
      throw new AnalyzeError(
        "forbidden",
        "Couldn't resolve a Guardian space for ontology."
      );
    }
    profileId = profile.id;
  }

  if (source.profile_id !== profileId) {
    await supabase
      .from("connected_sources")
      .update({ profile_id: profileId })
      .eq("id", args.sourceId)
      .eq("user_id", args.user.id);
    source.profile_id = profileId;
  }

  // Idempotency: same content hash AND same analysis version already analyzed.
  // Require a real analysis_version — null/undefined must not skip.
  if (
    !args.force &&
    item.processing_status === "analyzed" &&
    item.content_hash &&
    item.content_hash === args.contentHash &&
    item.analysis_version === version
  ) {
    const moved = await rehomeConnectorOntologyToSpace(supabase, {
      sourceItemId: item.id,
      profileId,
    });
    const existing = await listOntologyForSourceItem(
      supabase,
      profileId,
      item.id
    );
    if (existing.entities.length > 0) {
      return {
        skipped: true,
        reason: moved > 0 ? "rehomed" : "unchanged",
        profileId,
        stats: {
          entitiesCreated: 0,
          entitiesMatched: existing.entities.length,
          relationshipsCreated: 0,
          evidenceCreated: 0,
          eventsCreated: 0,
        },
        entitiesFound: existing.entities.length,
        relationshipsFound: existing.relationships.length,
        confidenceLabel: confidenceLabelFromItems(
          existing.entities,
          existing.relationships
        ),
        analysisVersion: item.analysis_version ?? version,
        entities: existing.entities,
        relationships: existing.relationships,
      };
    }
    // Analyzed on the connection, but nothing in this space — extract again.
  }

  await supabase
    .from("source_items")
    .update({
      processing_status: "analyzing",
      analysis_error: null,
    })
    .eq("id", item.id);

  try {
    const { data: profile } = await supabase
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", profileId)
      .maybeSingle();

    // Prefer catalog name — upload File.name can be generic ("file") and
    // would defeat filename fallback for chart PDFs.
    const fileName = item.name || args.content.filename || "file";
    const itemMeta =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {};
    const { extraction: rawExtraction } = await extractOntologyFromSourceContent({
      content: {
        ...args.content,
        filename: fileName,
        metadata: {
          ...(args.content.metadata ?? {}),
          ...itemMeta,
        },
      },
      spaceName: profile?.display_name ?? null,
    });

    let extraction =
      rawExtraction ?? fallbackOntologyFromFileName(fileName);

    const meta = itemMeta;
    const cardName = String(meta.cardName ?? "").trim();
    if (
      extraction &&
      String(meta.provider ?? "") === "trello" &&
      String(meta.kind ?? "") === "attachment" &&
      cardName
    ) {
      extraction = mergeTrelloAttachmentOntoSong(extraction, {
        cardName,
        fileName,
      });
    }

    if (!extraction) {
      await supabase
        .from("source_items")
        .update({
          processing_status: "analysis_failed",
          analysis_error:
            "Couldn't extract enough content to build knowledge from this file.",
          content_hash: args.contentHash,
          analysis_version: version,
        })
        .eq("id", item.id);

      throw new AnalyzeError(
        "extraction_failed",
        "Couldn't extract enough content to build knowledge from this file."
      );
    }

    const stats = await persistConnectorOntologyExtraction(supabase, {
      userId: args.user.id,
      profileId,
      sourceItemId: item.id,
      fileName: item.name,
      extraction,
      analysisVersion: version,
    });

    await supabase
      .from("source_items")
      .update({
        processing_status: "analyzed",
        analysis_error: null,
        analyzed_at: new Date().toISOString(),
        content_hash: args.contentHash,
        analysis_version: version,
      })
      .eq("id", item.id);

    const listed = await listOntologyForSourceItem(
      supabase,
      profileId,
      item.id
    );

    return {
      skipped: false,
      profileId,
      stats,
      entitiesFound: listed.entities.length,
      relationshipsFound: listed.relationships.length,
      confidenceLabel: confidenceLabelFromItems(
        listed.entities,
        listed.relationships
      ),
      analysisVersion: version,
      entities: listed.entities,
      relationships: listed.relationships,
    };
  } catch (err) {
    if (err instanceof AnalyzeError) {
      if (err.code !== "extraction_failed") {
        await supabase
          .from("source_items")
          .update({
            processing_status: "analysis_failed",
            analysis_error: err.message.slice(0, 500),
          })
          .eq("id", item.id);
      }
      throw err;
    }

    const message =
      err instanceof Error
        ? err.message
        : "Analysis failed. You can try again.";
    await supabase
      .from("source_items")
      .update({
        processing_status: "analysis_failed",
        analysis_error: message.slice(0, 500),
      })
      .eq("id", item.id);
    throw new AnalyzeError("unknown", message, { cause: err });
  }
}

function confidenceLabelFromItems(
  entities: Array<{ confidence: number | null }>,
  relationships: Array<{ confidence: number | null }>
): "High" | "Medium" | "Low" | "None" {
  const scores = [...entities, ...relationships]
    .map((i) => i.confidence)
    .filter((c): c is number => typeof c === "number");
  if (scores.length === 0) return "None";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 0.9) return "High";
  if (avg >= 0.7) return "Medium";
  return "Low";
}

export class AnalyzeError extends Error {
  readonly code:
    | "not_found"
    | "permission_revoked"
    | "unavailable"
    | "unsupported"
    | "too_large"
    | "forbidden"
    | "extraction_failed"
    | "unknown";

  constructor(
    code: AnalyzeError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "AnalyzeError";
    this.code = code;
  }
}
