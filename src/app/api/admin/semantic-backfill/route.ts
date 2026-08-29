import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import {
  getSemanticBackfillStatus,
  queueSemanticBackfill,
} from "@/lib/semantic/backfill";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin-only Semantic Layer backfill.
 * POST queues a batch of extract_semantic jobs across accessible Spaces.
 * GET returns progress counts.
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId") ?? undefined;

  const status = await getSemanticBackfillStatus(supabase, user.id, spaceId);
  return NextResponse.json({
    enabled: isGuardianSemanticLayerEnabled(),
    ...status,
  });
}

export async function POST(request: Request) {
  if (!isGuardianSemanticLayerEnabled()) {
    return NextResponse.json(
      { error: "Semantic Layer is disabled. Set GUARDIAN_SEMANTIC_LAYER_ENABLED=true." },
      { status: 400 }
    );
  }

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
    spaceId?: string;
    limit?: number;
    includeCompleted?: boolean;
  };

  try {
    const result = await queueSemanticBackfill(supabase, {
      userId: user.id,
      spaceId: body.spaceId,
      limit: body.limit,
      includeCompleted: body.includeCompleted === true,
    });

    const status = await getSemanticBackfillStatus(
      supabase,
      user.id,
      body.spaceId
    );

    return NextResponse.json({
      ok: true,
      ...result,
      status,
      note: "Jobs are queued. Cron / process-jobs will run extract_semantic. Click again to queue the next batch.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
