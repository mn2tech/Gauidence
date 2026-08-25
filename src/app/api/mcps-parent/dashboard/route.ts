import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildParentDashboard } from "@/lib/mcps-parent/dashboard";
import { parseYmd } from "@/lib/mcps-parent/dates";

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

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Admin database client is not configured." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const asOfRaw = url.searchParams.get("as_of");
  const asOf = asOfRaw ? parseYmd(asOfRaw) ?? new Date() : new Date();

  const dashboard = await buildParentDashboard({
    admin,
    supabase: auth.supabase,
    userId: auth.user.id,
    asOf,
  });

  return NextResponse.json(dashboard);
}
