import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingDocumentJobs } from "@/lib/documents/processingJobs";
import { queueGuardianIntelligenceBackfill } from "@/lib/guardian-today/backfill";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Queue Guardian intelligence extraction for analyzed documents that were
 * never processed (pre-Guardian Today historical Spaces).
 * Membership-scoped via RLS + explicit space membership filter.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let limit = 12;
  let drain = false;
  try {
    const body = (await request.json()) as {
      limit?: number;
      drain?: boolean;
    };
    if (typeof body.limit === "number") {
      limit = Math.min(Math.max(Math.floor(body.limit), 1), 40);
    }
    if (typeof body.drain === "boolean") drain = body.drain;
  } catch {
    /* empty body ok */
  }

  const { data: memberships } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", user.id);

  const spaceIds = [
    ...new Set((memberships ?? []).map((m) => m.profile_id as string)),
  ];

  const backfill = await queueGuardianIntelligenceBackfill(supabase, {
    userId: user.id,
    spaceIds,
    limit,
  });

  let drained = { processed: 0, failed: 0 };
  if (drain && backfill.queued > 0) {
    drained = await processPendingDocumentJobs(supabase, user.id, {
      limit: Math.min(backfill.queued, 4),
    });
  }

  return NextResponse.json({
    ok: true,
    queued: backfill.queued,
    skipped: backfill.skipped,
    documentIds: backfill.documentIds,
    drained,
  });
}
