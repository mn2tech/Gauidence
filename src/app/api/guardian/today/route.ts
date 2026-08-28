import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGuardianToday } from "@/lib/guardian-today/today";

export const runtime = "nodejs";

export async function GET() {
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

  const today = await getGuardianToday(supabase, user.id);
  return NextResponse.json(today);
}
