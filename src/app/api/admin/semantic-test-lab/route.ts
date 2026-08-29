import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { extractSemanticKnowledge } from "@/lib/semantic/extract-semantic-knowledge";
import { parseSemanticExtraction } from "@/lib/semantic/schema";
import {
  canonicalizeOrganizationKey,
  normalizeEntityName,
  nameSimilarity,
} from "@/lib/semantic/normalize";
import type { SemanticExtractionResult } from "@/lib/semantic/types";

export const runtime = "nodejs";

/**
 * Admin-only Semantic Test Lab.
 * Analyzes pasted text without requiring persistence (optionally dry-run).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    persist?: boolean;
    spaceId?: string;
  };

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const extraction = await extractSemanticKnowledge({
    userId: user.id,
    spaceId: body.spaceId,
    sourceType: "manual",
    sourceId: `semantic-lab-${Date.now()}`,
    sourceTitle: "Semantic Test Lab",
    content,
  });

  // Simulate entity resolution against extraction itself (alias / org suffix)
  const resolutionPreview = previewEntityResolutions(extraction);

  let ingest: unknown = null;
  if (body.persist) {
    const { ingestSemanticKnowledge } = await import(
      "@/lib/semantic/ingest-semantic-knowledge"
    );
    ingest = await ingestSemanticKnowledge(supabase, {
      userId: user.id,
      spaceId: body.spaceId,
      sourceType: "manual",
      sourceId: `semantic-lab-${Date.now()}`,
      sourceTitle: "Semantic Test Lab",
      content,
    });
  }

  return NextResponse.json({
    entities: extraction.entities,
    relationships: extraction.relationships,
    facts: extraction.facts,
    actions: extraction.actions,
    warnings: extraction.warnings,
    evidence: {
      sourceType: "manual",
      sourceTitle: "Semantic Test Lab",
      excerptPreview: content.slice(0, 200),
    },
    entityResolution: resolutionPreview,
    ingest,
  });
}

/** Dry-run resolution within a single extraction batch (no DB). */
function previewEntityResolutions(extraction: SemanticExtractionResult) {
  const clusters: Array<{
    canonical: string;
    type: string;
    members: string[];
    method: string;
  }> = [];

  const used = new Set<number>();
  for (let i = 0; i < extraction.entities.length; i++) {
    if (used.has(i)) continue;
    const a = extraction.entities[i]!;
    const members = [a.name];
    let method = "exact";

    for (let j = i + 1; j < extraction.entities.length; j++) {
      if (used.has(j)) continue;
      const b = extraction.entities[j]!;
      if (a.type !== b.type) continue;

      const na = normalizeEntityName(a.name);
      const nb = normalizeEntityName(b.name);
      if (na === nb) {
        members.push(b.name);
        used.add(j);
        method = "exact";
        continue;
      }

      const aliases = new Set(
        (a.aliases ?? []).map(normalizeEntityName).concat([na])
      );
      if (aliases.has(nb) || (b.aliases ?? []).map(normalizeEntityName).includes(na)) {
        members.push(b.name);
        used.add(j);
        method = "alias";
        continue;
      }

      if (
        (a.type === "organization" || a.type === "agency") &&
        canonicalizeOrganizationKey(a.name) ===
          canonicalizeOrganizationKey(b.name)
      ) {
        members.push(b.name);
        used.add(j);
        method = "alias";
        continue;
      }

      if (nameSimilarity(a.name, b.name) >= 0.92) {
        members.push(b.name);
        used.add(j);
        method = "fuzzy";
      }
    }

    clusters.push({
      canonical: a.name,
      type: a.type,
      members,
      method,
    });
  }

  return clusters;
}

/** Exposed for unit tests of lab parse path. */
export function parseLabExtraction(raw: unknown) {
  return parseSemanticExtraction(raw);
}
