import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Public summit space metadata and published entities.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) {
    return NextResponse.json(
      { error: "Guardian is not configured" },
      { status: 503 }
    );
  }

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) {
    return NextResponse.json({ error: "Summit not found" }, { status: 404 });
  }

  return NextResponse.json({
    space: {
      slug: knowledge.space.slug,
      name: knowledge.space.name,
      subtitle: knowledge.space.subtitle,
      description: knowledge.space.description,
      ownerLabel: knowledge.space.owner_label,
    },
    entities: knowledge.entities.map((e) => ({
      id: e.id,
      type: e.entity_type,
      slug: e.slug,
      name: e.name,
      description: e.description,
      properties: e.properties,
      sourceLabel: e.source_label,
      lastUpdated: e.last_updated_at,
    })),
  });
}
