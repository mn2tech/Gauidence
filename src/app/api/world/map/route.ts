import { NextResponse } from "next/server";
import { getWorldMap } from "@/lib/world/map";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

const GROUPS = new Set(["people", "organizations", "events", "things"]);

export async function GET(request: Request) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const url = new URL(request.url);
  const expandRaw = url.searchParams.get("expand") ?? "people,organizations,events,things";
  const expandedGroups = expandRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is "people" | "organizations" | "events" | "things" =>
      GROUPS.has(s)
    );

  const maxRaw = url.searchParams.get("max");
  const maxNodes = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;

  try {
    const graph = await getWorldMap(auth.supabase, auth.user.id, {
      expandedGroups,
      maxNodes: Number.isFinite(maxNodes) ? maxNodes : undefined,
      userLabel: "You",
    });
    return NextResponse.json(graph);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load your world map.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
