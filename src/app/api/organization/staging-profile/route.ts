import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnorganizedProfileId } from "@/lib/organization/unorganized";

export const runtime = "nodejs";

/** Neutral staging space for Add Anything uploads before organization. */
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

  const profileId = await getUnorganizedProfileId(supabase, user.id);
  if (!profileId) {
    return NextResponse.json(
      { error: "Couldn't prepare a staging space for uploads." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profileId,
    displayName: "Unorganized",
  });
}
