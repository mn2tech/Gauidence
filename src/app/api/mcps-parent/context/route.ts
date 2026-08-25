import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getPrimarySchoolContext,
  upsertPrimarySchoolContext,
} from "@/lib/mcps-parent/dashboard";
import { GRADE_OPTIONS } from "@/lib/mcps-parent/constants";
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
  const context = await getPrimarySchoolContext(auth.supabase, auth.user.id);
  return NextResponse.json({
    context,
    grade_options: GRADE_OPTIONS,
    school_options: MCPS_SCHOOL_OPTIONS,
  });
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    school_name?: string;
    grade_level?: string;
  };

  try {
    const context = await upsertPrimarySchoolContext({
      supabase: auth.supabase,
      userId: auth.user.id,
      schoolName: typeof body.school_name === "string" ? body.school_name : "",
      gradeLevel: typeof body.grade_level === "string" ? body.grade_level : "",
    });
    return NextResponse.json({ ok: true, context });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 400 }
    );
  }
}
