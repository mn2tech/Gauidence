import { NextResponse } from "next/server";
import { getWorldTimeline } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const url = new URL(request.url);
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const entries = await getWorldTimeline(auth.supabase, auth.user.id, {
      entityId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ entries });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load recent changes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
