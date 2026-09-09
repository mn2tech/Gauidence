import { NextResponse } from "next/server";
import { getWorldOverview } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

/** My World overview — counts, important people/things, attention, timeline. */
export async function GET() {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  try {
    const overview = await getWorldOverview(auth.supabase, auth.user.id);
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load My World.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
