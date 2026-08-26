import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listParentSchoolContexts } from "@/lib/mcps-parent/contexts";
import { answerParentSchoolQuestion } from "@/lib/mcps-parent/ask";

export const runtime = "nodejs";
export const maxDuration = 60;

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
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
  return { supabase, user };
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const contexts = await listParentSchoolContexts(auth.supabase, auth.user.id);
  if (!contexts.length) {
    return NextResponse.json(
      { error: "Add a child / school first." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Admin database client is not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    view?: string;
  };
  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) {
    return NextResponse.json({ error: "question is required." }, { status: 400 });
  }

  const activeView =
    typeof body.view === "string" && body.view.trim()
      ? body.view.trim()
      : "all";

  try {
    const result = await answerParentSchoolQuestion({
      admin,
      question,
      contexts,
      activeView,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ask Gideon failed.";
    console.error("MCPS parent ask failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
