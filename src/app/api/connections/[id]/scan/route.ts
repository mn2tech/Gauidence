import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { upsertScanResults } from "@/lib/connectors/services/sourceItems";
import type { SourceItem } from "@/lib/connectors/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
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
  if (source.status === "disconnected") {
    return NextResponse.json(
      { error: "This connection is disconnected. Reconnect to scan." },
      { status: 400 }
    );
  }

  let body: { items?: SourceItem[]; permissionRevoked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.permissionRevoked) {
    await supabase
      .from("connected_sources")
      .update({ status: "permission_revoked" })
      .eq("id", id)
      .eq("user_id", user.id);
    return NextResponse.json({
      error: "permission_revoked",
      message: "Guardian no longer has access to this folder.",
    }, { status: 403 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "items array is required." },
      { status: 400 }
    );
  }

  // Sanitize client payloads — never accept file content fields.
  const items: SourceItem[] = body.items
    .map((raw): SourceItem => ({
      sourceId: id,
      externalId: String(raw.externalId ?? "").slice(0, 2000),
      name: String(raw.name ?? "untitled").slice(0, 500),
      mimeType: raw.mimeType ? String(raw.mimeType).slice(0, 200) : undefined,
      sourceUri: String(raw.sourceUri ?? "").slice(0, 2000),
      sizeBytes:
        typeof raw.sizeBytes === "number" && Number.isFinite(raw.sizeBytes)
          ? Math.max(0, Math.floor(raw.sizeBytes))
          : undefined,
      modifiedAt: raw.modifiedAt ? String(raw.modifiedAt) : undefined,
      metadata:
        raw.metadata && typeof raw.metadata === "object"
          ? (raw.metadata as Record<string, unknown>)
          : {},
      processingStatus: "discovered",
    }))
    .filter((item) => item.externalId.length > 0);

  try {
    const summary = await upsertScanResults(supabase, id, items);
    return NextResponse.json({ summary });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Couldn't save scan results. Previously indexed metadata was kept.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
