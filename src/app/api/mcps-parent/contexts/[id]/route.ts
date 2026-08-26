import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  deleteParentSchoolContext,
  updateParentSchoolContext,
} from "@/lib/mcps-parent/contexts";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;

  const body = (await request.json().catch(() => ({}))) as {
    school_name?: string;
    grade_level?: string;
    label?: string | null;
    make_primary?: boolean;
  };

  try {
    const updated = await updateParentSchoolContext({
      supabase: auth.supabase,
      userId: auth.user.id,
      id,
      schoolName: body.school_name,
      gradeLevel: body.grade_level,
      label: body.label,
      makePrimary: body.make_primary,
    });
    return NextResponse.json({ ok: true, context: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;

  try {
    const result = await deleteParentSchoolContext({
      supabase: auth.supabase,
      userId: auth.user.id,
      id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 400 }
    );
  }
}
