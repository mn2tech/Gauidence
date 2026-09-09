import { NextResponse } from "next/server";
import { searchWorld } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const entities = await searchWorld(auth.supabase, auth.user.id, q, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ entities, query: q });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't search My World.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
