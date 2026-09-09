/**
 * Shared auth helper for /api/world/* routes.
 */

import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type WorldAuthed = { supabase: SupabaseClient; user: User };

export async function requireWorldUser(): Promise<
  WorldAuthed | NextResponse
> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

export function isWorldAuthed(
  v: WorldAuthed | NextResponse
): v is WorldAuthed {
  return !(v instanceof NextResponse);
}
