import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trySendWelcomeEmail } from "@/lib/retention/run";

export const runtime = "nodejs";

/** Idempotent welcome email after signup (email/password with immediate session). */
export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent = await trySendWelcomeEmail(user.id);
  return NextResponse.json({ sent });
}
