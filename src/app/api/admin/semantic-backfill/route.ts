import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { processPendingDocumentJobsAdmin } from "@/lib/documents/processingJobs";
import {
  getSemanticBackfillStatus,
  queueSemanticBackfill,
} from "@/lib/semantic/backfill";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-only Semantic Layer backfill.
 * POST queues extract_semantic jobs and processes a batch immediately.
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

  // Pending semantic jobs waiting in the queue (helps diagnose "not running")
  const { count: jobsPending } = await supabase
    .from("document_processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("job_type", "extract_semantic")
    .in("status", ["pending", "retryable"]);

  return NextResponse.json({
    enabled: isGuardianSemanticLayerEnabled(),
    ...status,
    jobsPending: jobsPending ?? 0,
  });
}

export async function POST(request: Request) {
  if (!isGuardianSemanticLayerEnabled()) {
    return NextResponse.json(
      {
        error:
          "Semantic Layer is disabled. Set GUARDIAN_SEMANTIC_LAYER_ENABLED=true.",
      },
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
    processNow?: boolean;
  };

  try {
    const result = await queueSemanticBackfill(supabase, {
      userId: user.id,
      spaceId: body.spaceId,
      limit: body.limit ?? 25,
      includeCompleted: body.includeCompleted === true,
    });

    let processed = 0;
    let failed = 0;
    const processNow = body.processNow !== false;
    if (processNow) {
      const admin = createAdminClient();
      const worker = admin ?? supabase;
      const drain = await processPendingDocumentJobsAdmin(worker, {
        limit: 5,
        jobTypes: ["extract_semantic"],
        userId: user.id,
      });
      processed = drain.processed;
      failed = drain.failed;
    }

    const status = await getSemanticBackfillStatus(
      supabase,
      user.id,
      body.spaceId
    );

    return NextResponse.json({
      ok: true,
      ...result,
      processed,
      failed,
      status,
      note:
        processed > 0
          ? `Queued ${result.queued}, processed ${processed} now. Cron will continue draining the rest.`
          : `Queued ${result.queued}. If processed stays 0, check jobsPending on refresh and Vercel cron / CRON_SECRET.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
