import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingDocumentJobsAdmin } from "@/lib/documents/processingJobs";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { queueSemanticBackfillAdmin } from "@/lib/semantic/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Background worker for document processing (Vercel Cron). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role key isn't configured." },
      { status: 503 }
    );
  }

  let semanticQueued = 0;
  let semanticSkipped = 0;
  let semanticProcessed = 0;
  let semanticFailed = 0;

  // Prefer draining attention + semantic jobs so chat uploads hit Today quickly.
  if (isGuardianSemanticLayerEnabled()) {
    try {
      const backfill = await queueSemanticBackfillAdmin(admin, { limit: 20 });
      semanticQueued = backfill.queued;
      semanticSkipped = backfill.skipped;
    } catch (err) {
      console.error(
        "Semantic auto-backfill failed (non-blocking):",
        err instanceof Error ? err.message : err
      );
    }

    try {
      const semanticDrain = await processPendingDocumentJobsAdmin(admin, {
        limit: 6,
        jobTypes: ["extract_semantic"],
      });
      semanticProcessed = semanticDrain.processed;
      semanticFailed = semanticDrain.failed;
    } catch (err) {
      console.error(
        "Semantic job drain failed (non-blocking):",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Always drain guardian items so Ask/chat uploads surface on Today.
  try {
    await processPendingDocumentJobsAdmin(admin, {
      limit: 6,
      jobTypes: ["extract_guardian_items"],
    });
  } catch (err) {
    console.error(
      "Guardian items drain failed (non-blocking):",
      err instanceof Error ? err.message : err
    );
  }

  const result = await processPendingDocumentJobsAdmin(admin, { limit: 3 });

  return NextResponse.json({
    ...result,
    semanticQueued,
    semanticSkipped,
    semanticProcessed,
    semanticFailed,
  });
}
