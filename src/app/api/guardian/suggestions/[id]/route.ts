import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dismissProactiveSuggestion } from "@/lib/knowledge/queries";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing suggestion id." }, { status: 400 });
  }

  const ok = await dismissProactiveSuggestion(supabase, user.id, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Couldn't dismiss suggestion." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
