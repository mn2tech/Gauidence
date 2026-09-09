import { NextResponse } from "next/server";
import { getWorldEntity } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entityId: string }> }
) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const { entityId } = await context.params;
  if (!entityId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const detail = await getWorldEntity(auth.supabase, auth.user.id, entityId);
    if (!detail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load this.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
