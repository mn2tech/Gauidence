import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listOntologyForSourceItem } from "@/lib/ontology/pipeline/persistConnectorOntology";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** Fetch ontology produced for a source item. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id: sourceId, itemId } = await ctx.params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const source = await getConnectedSource(supabase, user.id, sourceId);
  if (!source) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  const item = await getSourceItem(supabase, sourceId, itemId);
  if (!item) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const profileId = source.profileId;
  if (!profileId) {
    return NextResponse.json({
      item,
      profileId: null,
      entities: [],
      relationships: [],
    });
  }

  const listed = await listOntologyForSourceItem(supabase, profileId, itemId);
  return NextResponse.json({
    item,
    profileId,
    ...listed,
  });
}
