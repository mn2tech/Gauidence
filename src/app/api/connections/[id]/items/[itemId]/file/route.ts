import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSourceWithSecrets } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";
import { loadTrelloItemAnalysisContent } from "@/lib/connectors/trello/scan";
import { guessMimeFromName } from "@/lib/connectors/content/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Stream file bytes for in-app preview (Content-Disposition: inline).
 * Remote connectors (Trello attachments) are fetched server-side.
 * Device Storage files stay on-device — clients should read locally.
 */
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

  const source = await getConnectedSourceWithSecrets(supabase, user.id, sourceId);
  if (!source) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  const item = await getSourceItem(supabase, sourceId, itemId);
  if (!item) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (source.sourceType !== "trello") {
    return NextResponse.json(
      {
        error:
          "This file stays on your device. Open it from Device Storage or use Analyze to read it temporarily.",
        code: "client_local",
      },
      { status: 409 }
    );
  }

  const kind = String(item.metadata?.kind ?? "");
  if (kind !== "attachment") {
    return NextResponse.json(
      { error: "Preview is only available for Trello file attachments." },
      { status: 400 }
    );
  }

  try {
    const loaded = await loadTrelloItemAnalysisContent(source, item);
    if (loaded.bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "This file is too large to preview (15 MB limit)." },
        { status: 413 }
      );
    }

    const mime =
      loaded.mimeType ||
      guessMimeFromName(loaded.filename) ||
      "application/octet-stream";
    const safeName = sanitizeFileName(loaded.filename || item.name || "file.pdf");

    return new NextResponse(Buffer.from(loaded.bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(loaded.bytes.byteLength),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load this file for preview.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "file.pdf";
}
