import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AnalyzeError,
  analyzeSourceItem,
} from "@/lib/ontology/pipeline/analyzeSourceItem";
import {
  guessMimeFromName,
  isAnalyzeSupportedMime,
} from "@/lib/connectors/content/types";
import { connectorLog } from "@/lib/connectors/log";
import { getConnectedSourceWithSecrets } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";
import { loadTrelloItemAnalysisContent } from "@/lib/connectors/trello/scan";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Analyze a connected source item into ontology.
 * Accepts multipart form with temporary file bytes — never stored in Storage.
 * For Trello boards, accepts JSON `{ fetchFromSource: true }` and loads via API.
 */
export async function POST(req: Request, ctx: Ctx) {
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

  let filename = "file";
  let mimeType = "application/octet-stream";
  let bytes: Uint8Array;
  let contentHash: string;
  let profileId: string | null = null;
  let force = false;
  let text: string | undefined;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "file is required for analysis." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "This file is too large to analyze right now (15 MB limit)." },
          { status: 413 }
        );
      }
      filename = file.name || filename;
      mimeType = file.type || guessMimeFromName(filename);
      const buf = new Uint8Array(await file.arrayBuffer());
      bytes = buf;
      contentHash =
        String(form.get("contentHash") ?? "").trim() ||
        (await sha256Hex(buf));
      const pid = form.get("profileId");
      profileId = typeof pid === "string" && pid.trim() ? pid.trim() : null;
      force = String(form.get("force") ?? "") === "1";
      const providedText = form.get("text");
      if (typeof providedText === "string" && providedText.trim()) {
        text = providedText;
      }
    } else {
      const body = (await req.json()) as {
        filename?: string;
        mimeType?: string;
        base64?: string;
        contentHash?: string;
        profileId?: string | null;
        force?: boolean;
        text?: string;
        fetchFromSource?: boolean;
      };

      if (body.fetchFromSource) {
        const source = await getConnectedSourceWithSecrets(
          supabase,
          user.id,
          sourceId
        );
        if (!source || (source.sourceType !== "trello" && source.sourceType !== "google_drive")) {
          return NextResponse.json(
            { error: "fetchFromSource is only supported for Trello and Google Drive." },
            { status: 400 }
          );
        }
        const item = await getSourceItem(supabase, sourceId, itemId);
        if (!item) {
          return NextResponse.json({ error: "Item not found." }, { status: 404 });
        }
        const loaded =
          source.sourceType === "google_drive"
            ? await (async () => {
                const { googleDriveAccessTokenForSource } = await import(
                  "@/lib/connectors/googleDrive/access"
                );
                const { loadGoogleDriveItemAnalysisContent } = await import(
                  "@/lib/connectors/googleDrive/scan"
                );
                const accessToken = await googleDriveAccessTokenForSource(
                  supabase,
                  user.id,
                  source
                );
                return loadGoogleDriveItemAnalysisContent(accessToken, item);
              })()
            : await loadTrelloItemAnalysisContent(source, item);
        if (loaded.bytes.byteLength > MAX_BYTES) {
          return NextResponse.json(
            {
              error:
                "This file is too large to analyze right now (15 MB limit).",
            },
            { status: 413 }
          );
        }
        filename = loaded.filename;
        mimeType = loaded.mimeType;
        bytes = loaded.bytes;
        text = loaded.text;
        contentHash = body.contentHash?.trim() || (await sha256Hex(bytes));
        // Bound connector space wins over active space.
        profileId = source.profileId ?? body.profileId ?? null;
        force = Boolean(body.force);
      } else {
        if (!body.base64) {
          return NextResponse.json(
            { error: "base64 content is required." },
            { status: 400 }
          );
        }
        filename = body.filename?.trim() || filename;
        mimeType = body.mimeType || guessMimeFromName(filename);
        bytes = Uint8Array.from(Buffer.from(body.base64, "base64"));
        if (bytes.byteLength > MAX_BYTES) {
          return NextResponse.json(
            { error: "This file is too large to analyze right now (15 MB limit)." },
            { status: 413 }
          );
        }
        contentHash = body.contentHash?.trim() || (await sha256Hex(bytes));
        profileId = body.profileId ?? null;
        force = Boolean(body.force);
        text = body.text;
      }
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Couldn't read the uploaded file for analysis.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!isAnalyzeSupportedMime(mimeType, filename)) {
    return NextResponse.json(
      {
        error:
          "This file type isn't supported for Analyze yet. Try a PDF, image, text, JSON, CSV, or Excel file.",
      },
      { status: 400 }
    );
  }

  connectorLog("scan_started", {
    event: "analyze_started",
    sourceId,
    itemId,
    mimeType,
    byteLength: bytes.byteLength,
  });

  try {
    const result = await analyzeSourceItem(supabase, {
      user,
      sourceId,
      itemId,
      content: {
        mimeType,
        filename,
        bytes,
        text,
      },
      contentHash,
      profileId,
      force,
    });

    connectorLog("scan_completed", {
      event: "analyze_completed",
      sourceId,
      itemId,
      skipped: result.skipped,
      entitiesFound: result.entitiesFound,
      relationshipsFound: result.relationshipsFound,
    });

    return NextResponse.json({
      ok: true,
      skipped: result.skipped,
      reason: result.reason,
      profileId: result.profileId,
      entitiesFound: result.entitiesFound,
      relationshipsFound: result.relationshipsFound,
      confidence: result.confidenceLabel,
      analysisVersion: result.analysisVersion,
      stats: result.stats,
      entities: result.entities,
      relationships: result.relationships,
    });
  } catch (err) {
    if (err instanceof AnalyzeError) {
      const status =
        err.code === "not_found"
          ? 404
          : err.code === "forbidden"
            ? 403
            : err.code === "permission_revoked" || err.code === "unavailable"
              ? 409
              : err.code === "unsupported" || err.code === "too_large"
                ? 400
                : 500;
      connectorLog("error", {
        event: "analyze_failed",
        sourceId,
        itemId,
        code: err.code,
      });
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message =
      err instanceof Error ? err.message : "Analysis failed. Try again.";
    connectorLog("error", { event: "analyze_failed", sourceId, itemId });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
