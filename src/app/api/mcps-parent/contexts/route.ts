import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  createParentSchoolContext,
  listParentSchoolContexts,
} from "@/lib/mcps-parent/contexts";
import { GRADE_OPTIONS, MAX_PARENT_SCHOOL_CONTEXTS } from "@/lib/mcps-parent/constants";
import { MCPS_SCHOOL_OPTIONS } from "@/lib/mcps-parent/schools";

export const runtime = "nodejs";

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

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  try {
    const contexts = await listParentSchoolContexts(auth.supabase, auth.user.id);
    return NextResponse.json({
      contexts,
      max_contexts: MAX_PARENT_SCHOOL_CONTEXTS,
      grade_options: GRADE_OPTIONS,
      school_options: MCPS_SCHOOL_OPTIONS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    school_name?: string;
    grade_level?: string;
    label?: string | null;
    make_primary?: boolean;
  };

  try {
    const context = await createParentSchoolContext({
      supabase: auth.supabase,
      userId: auth.user.id,
      schoolName: typeof body.school_name === "string" ? body.school_name : "",
      gradeLevel: typeof body.grade_level === "string" ? body.grade_level : "",
      label: body.label,
      makePrimary: Boolean(body.make_primary),
    });
    return NextResponse.json({ ok: true, context });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 400 }
    );
  }
}
