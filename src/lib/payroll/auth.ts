import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianPayroll } from "@/lib/features/payroll";

export type Authed = { supabase: SupabaseClient; user: User };

export async function requirePayrollUser(): Promise<Authed | NextResponse> {
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
  if (!canAccessGuardianPayroll({ email: user.email })) {
    return NextResponse.json(
      { error: "Guardian Payroll is not available for your account." },
      { status: 403 }
    );
  }
  return { supabase, user };
}

export function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}
