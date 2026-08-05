import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStorageSnapshot } from "@/lib/billing/storage";

export const runtime = "nodejs";

/** Vault storage usage for the signed-in account. */
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

  const snapshot = await getStorageSnapshot(supabase, user.id);
  return NextResponse.json(snapshot);
}
