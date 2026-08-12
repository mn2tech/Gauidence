import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { listSourceItems } from "@/lib/connectors/services/sourceItems";
import { countByCategory } from "@/lib/connectors/classify";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const summaryOnly = url.searchParams.get("summary") === "1";

  try {
    const items = await listSourceItems(supabase, id, { search, status });
    const active = items.filter((i) => i.processingStatus !== "unavailable");
    const categories = countByCategory(
      active.map((i) => ({ name: i.name, mimeType: i.mimeType }))
    );

    if (summaryOnly) {
      return NextResponse.json({
        total: active.length,
        unavailable: items.filter((i) => i.processingStatus === "unavailable")
          .length,
        categories,
        lastScanAt: source.lastScanAt,
      });
    }

    let filtered = items;
    if (category && category !== "All" && category !== "all") {
      const { classifyFileType } = await import("@/lib/connectors/classify");
      filtered = items.filter(
        (item) => classifyFileType(item.name, item.mimeType) === category
      );
    }

    return NextResponse.json({
      items: filtered,
      total: active.length,
      categories,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load files.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete unavailable metadata rows for this connection (does not touch device files). */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  if (scope !== "unavailable") {
    return NextResponse.json(
      { error: "Pass scope=unavailable to clear unavailable metadata." },
      { status: 400 }
    );
  }

  const { error, count } = await supabase
    .from("source_items")
    .delete({ count: "exact" })
    .eq("source_id", id)
    .eq("processing_status", "unavailable");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
