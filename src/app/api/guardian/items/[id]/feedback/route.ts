import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_ACTIONS,
  recordIntelligenceFeedback,
} from "@/lib/guardian-today/feedback";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!FEEDBACK_ACTIONS.includes(action as (typeof FEEDBACK_ACTIONS)[number])) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = await recordIntelligenceFeedback(
    supabase,
    user.id,
    id,
    action as (typeof FEEDBACK_ACTIONS)[number]
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
