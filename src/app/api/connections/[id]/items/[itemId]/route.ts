import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
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

  const source = await getConnectedSource(supabase, user.id, id);
  if (!source) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  try {
    const item = await getSourceItem(supabase, id, itemId);
    if (!item) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    return NextResponse.json({ item, source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load file details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
