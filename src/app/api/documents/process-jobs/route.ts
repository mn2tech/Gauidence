import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingDocumentJobs } from "@/lib/documents/processingJobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Drain pending document processing jobs for the signed-in user. */
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

  let limit = 2;
  try {
    const body = await request.json();
    if (typeof body.limit === "number" && body.limit > 0 && body.limit <= 5) {
      limit = body.limit;
    }
  } catch {
    // optional body
  }

  const result = await processPendingDocumentJobs(supabase, user.id, { limit });
  return NextResponse.json(result);
}
