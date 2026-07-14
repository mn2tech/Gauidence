import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public share lookup. Uses service role only after validating token +
 * expiry + not revoked. Does not expose owner identity.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token || token.length < 16 || token.length > 128) {
    return NextResponse.json({ error: "Invalid share link." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Sharing isn't fully configured on this deployment (service role key missing).",
      },
      { status: 503 }
    );
  }

  const { data: share, error: shareError } = await admin
    .from("document_shares")
    .select(
      "id, document_id, expires_at, revoked_at, include_file, created_at"
    )
    .eq("token", token)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json(
      { error: "This share link is invalid or has been removed." },
      { status: 404 }
    );
  }

  if (share.revoked_at) {
    return NextResponse.json(
      { error: "This share link has been revoked." },
      { status: 410 }
    );
  }

  if (new Date(share.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "This share link has expired." },
      { status: 410 }
    );
  }

  const { data: doc } = await admin
    .from("documents")
    .select("id, file_name, mime_type, size_bytes, category, created_at, file_path")
    .eq("id", share.document_id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json(
      { error: "This shared document is no longer available." },
      { status: 404 }
    );
  }

  const { data: analysis } = await admin
    .from("extracted_data")
    .select(
      "summary, facts, title, document_type, guardian_status, overall_confidence, classification_confidence"
    )
    .eq("document_id", doc.id)
    .maybeSingle();

  let fileUrl: string | null = null;
  if (share.include_file && doc.file_path) {
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 300);
    fileUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    document: {
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      sizeBytes: doc.size_bytes,
      category: doc.category,
      uploadedAt: doc.created_at,
    },
    analysis: analysis
      ? {
          summary: analysis.summary,
          facts: analysis.facts,
          title: analysis.title,
          documentType: analysis.document_type,
          guardianStatus: analysis.guardian_status,
          overallConfidence: analysis.overall_confidence,
          classificationConfidence: analysis.classification_confidence,
        }
      : null,
    includeFile: share.include_file,
    fileUrl,
    expiresAt: share.expires_at,
  });
}
