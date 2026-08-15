import { NextResponse } from "next/server";
import {
  isPackAuthed,
  requirePackSpaceAccess,
  requirePackSpaceManage,
  requirePackUser,
} from "@/lib/packs/auth";
import { getInstalledPack } from "@/lib/packs/catalog";
import {
  getAnalyzeProgress,
  previewAnalyzeKnowledge,
  startAnalyzeKnowledge,
} from "@/lib/packs/analyze";
import type { AnalyzeKnowledgeSelection } from "@/lib/packs/types";

export const runtime = "nodejs";
/** Enqueue stays bounded; keep headroom for parallel inserts. */
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

function parseSelection(body: Record<string, unknown>): AnalyzeKnowledgeSelection {
  return {
    spaceIds: Array.isArray(body.spaceIds)
      ? body.spaceIds.filter((x): x is string => typeof x === "string")
      : undefined,
    documentIds: Array.isArray(body.documentIds)
      ? body.documentIds.filter((x): x is string => typeof x === "string")
      : undefined,
    sourceItemIds: Array.isArray(body.sourceItemIds)
      ? body.sourceItemIds.filter((x): x is string => typeof x === "string")
      : undefined,
    proposalIds: Array.isArray(body.proposalIds)
      ? body.proposalIds.filter((x): x is string => typeof x === "string")
      : undefined,
    includeAllDocuments: body.includeAllDocuments === true,
    includeAllProposals: body.includeAllProposals === true,
    includeAllSourceItems: body.includeAllSourceItems === true,
  };
}

/** GET /api/packs/[slug]/analyze?profileId= — progress for last/current batch. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const { slug } = await params;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || "";
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  const profile = await requirePackSpaceAccess(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const progress = await getAnalyzeProgress(auth.supabase, profileId, slug);
  if (!progress) {
    return NextResponse.json(
      { error: "Pack is not installed on this Space." },
      { status: 404 }
    );
  }

  return NextResponse.json({ progress });
}

/** POST /api/packs/[slug]/analyze — preview or start knowledge analysis. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const { slug } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId =
    typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  const profile = await requirePackSpaceManage(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "Only the Space owner can analyze knowledge." },
      { status: 403 }
    );
  }

  const installed = await getInstalledPack(auth.supabase, profileId, slug);
  if (!installed) {
    return NextResponse.json(
      { error: "Install this Pack before analyzing knowledge." },
      { status: 400 }
    );
  }

  const selection = parseSelection(body);
  const previewOnly = body.preview === true;

  try {
    if (previewOnly) {
      const preview = await previewAnalyzeKnowledge(
        auth.supabase,
        profileId,
        selection,
        auth.user.id
      );
      return NextResponse.json({ preview });
    }

    const result = await startAnalyzeKnowledge(auth.supabase, {
      profileId,
      userId: auth.user.id,
      packSlug: slug,
      selection,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyze failed." },
      { status: 500 }
    );
  }
}
