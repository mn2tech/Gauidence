import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
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

  const source = await getConnectedSource(supabase, user.id, id);
  if (!source) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  try {
    const item = await getSourceItem(supabase, id, itemId);
    if (!item) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    return NextResponse.json({ item, source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load file details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Recover stuck "analyzing" rows after a client timeout / failed request.
 */
export async function PATCH(req: Request, ctx: Ctx) {
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

  const body = (await req.json().catch(() => ({}))) as {
    processingStatus?: string;
    analysisError?: string;
  };

  if (body.processingStatus !== "analysis_failed") {
    return NextResponse.json(
      { error: "Only analysis_failed recovery is supported." },
      { status: 400 }
    );
  }

  const item = await getSourceItem(supabase, sourceId, itemId);
  if (!item) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("source_items")
    .update({
      processing_status: "analysis_failed",
      analysis_error: (body.analysisError ?? "Analysis failed.").slice(0, 500),
    })
    .eq("id", itemId)
    .eq("source_id", sourceId)
    .in("processing_status", ["analyzing", "analysis_failed"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const refreshed = await getSourceItem(supabase, sourceId, itemId);
  return NextResponse.json({ item: refreshed });
}
