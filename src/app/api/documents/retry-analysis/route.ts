import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STUCK_THRESHOLD_MS = 20 * 60 * 1000;
const MAX_AUTO_RETRIES = 3;

type RetryMode = "failed" | "uploaded" | "stuck" | "all";

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

  let body: { mode?: RetryMode; documentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = body.mode ?? "all";
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  let query = supabase
    .from("documents")
    .select("id, file_name, analysis_status, created_at, profile_id");

  if (body.documentIds?.length) {
    query = query.in("id", body.documentIds);
  } else if (mode === "failed") {
    query = query.eq("analysis_status", "failed");
  } else if (mode === "uploaded") {
    query = query.eq("analysis_status", "uploaded");
  } else if (mode === "stuck") {
    query = query.eq("analysis_status", "analyzing").lt("created_at", threshold);
  } else {
    query = query.in("analysis_status", [
      "failed",
      "uploaded",
      "analyzing",
    ]);
  }

  const { data: docs, error } = await query.limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = (docs ?? []).filter((doc) => {
    if (doc.analysis_status === "analyzing") {
      return doc.created_at && doc.created_at < threshold;
    }
    return true;
  });

  const results: { id: string; fileName: string; status: string }[] = [];

  for (const doc of eligible.slice(0, MAX_AUTO_RETRIES * 10)) {
    if (doc.analysis_status === "analyzing") {
      await supabase
        .from("documents")
        .update({
          analysis_status: "uploaded",
        })
        .eq("id", doc.id);
    }

    results.push({
      id: doc.id,
      fileName: doc.file_name,
      status: "queued_for_retry",
    });
  }

  return NextResponse.json({
    queued: results.length,
    documents: results,
    note: "Re-trigger analysis from the Documents UI for each queued document.",
  });
}
