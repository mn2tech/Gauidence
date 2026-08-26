import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGuardianItemSource } from "@/lib/guardian-items/source";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const source = await getGuardianItemSource(supabase, id);
  if (!source) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json(source);
}
