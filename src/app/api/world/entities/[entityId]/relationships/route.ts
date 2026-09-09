import { NextResponse } from "next/server";
import { getWorldRelationships } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entityId: string }> }
) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const { entityId } = await context.params;
  try {
    const relationships = await getWorldRelationships(
      auth.supabase,
      auth.user.id,
      entityId
    );
    return NextResponse.json({ relationships });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load connections.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
