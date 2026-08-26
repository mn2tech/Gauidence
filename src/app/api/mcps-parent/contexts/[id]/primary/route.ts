import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { setPrimaryParentSchoolContext } from "@/lib/mcps-parent/contexts";

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

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;

  try {
    const updated = await setPrimaryParentSchoolContext({
      supabase: auth.supabase,
      userId: auth.user.id,
      id,
    });
    return NextResponse.json({ ok: true, context: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not set primary." },
      { status: 400 }
    );
  }
}
