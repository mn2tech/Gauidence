import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { loadUsageSummary } from "@/lib/usage/summary";

export const runtime = "nodejs";

export async function GET() {
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
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (!isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const summary = await loadUsageSummary();
  if (!summary) {
    return NextResponse.json(
      { error: "Couldn't load usage. Check SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  return NextResponse.json(summary);
}
