import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { runAllTestLabCases } from "@/lib/personal-space/testLab";

export const runtime = "nodejs";

/**
 * Admin-only Knowledge Test Lab.
 * Never runs destructive tests against production user data.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "reset-test-user") {
    return NextResponse.json({
      ok: true,
      message:
        "Reset Test User is scoped to lab fixtures only. Production user data is never modified by this action.",
    });
  }

  const out = runAllTestLabCases();
  return NextResponse.json(out);
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return NextResponse.json(runAllTestLabCases());
}
