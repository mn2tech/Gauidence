import { NextResponse } from "next/server";
import { getWorldInbox } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const items = await getWorldInbox(auth.supabase, auth.user.id, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ items });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load confirmations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
