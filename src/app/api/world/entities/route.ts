import { NextResponse } from "next/server";
import { getImportantEntities, searchWorld } from "@/lib/world/api";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

/** List important / searchable world entities (permission-filtered). */
export async function GET(request: Request) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const url = new URL(request.url);
  const group = url.searchParams.get("group") ?? undefined;
  const q = url.searchParams.get("q") ?? url.searchParams.get("search");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    if (q?.trim()) {
      const entities = await searchWorld(auth.supabase, auth.user.id, q, {
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return NextResponse.json({ entities });
    }

    const entities = await getImportantEntities(auth.supabase, auth.user.id, {
      group,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ entities });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load what Guardian knows.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
