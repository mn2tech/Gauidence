import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingDocumentJobsAdmin } from "@/lib/documents/processingJobs";

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

  const result = await processPendingDocumentJobsAdmin(admin, { limit: 4 });
  return NextResponse.json(result);
}
