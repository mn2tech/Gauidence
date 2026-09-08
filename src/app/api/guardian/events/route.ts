import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listGuardianProfiles } from "@/lib/profiles/server";
import {
  createGuardianEvent,
  listGuardianEvents,
} from "@/lib/guardian-events/repository";
import {
  buildHistoryTimeline,
  isHistoryFilter,
  type HistoryFilter,
} from "@/lib/guardian-events/history";
import {
  deriveEventsFromTellGuardian,
  suggestSpaceIdFromText,
} from "@/lib/guardian-events/tellGuardian";
import { todayLogDate } from "@/lib/logs/types";
import { getUserTimeZone } from "@/lib/timezone/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
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
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

/** List History events for the signed-in user. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const filterParam = url.searchParams.get("filter") ?? "all";
  const filter: HistoryFilter = isHistoryFilter(filterParam)
    ? filterParam
    : "all";
  const limitRaw = Number(url.searchParams.get("limit") ?? "80");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 80;
  const spaceId = url.searchParams.get("spaceId")?.trim() || undefined;

  const listed = await listGuardianEvents(supabase, {
    userId: user.id,
    spaceIds: spaceId ? [spaceId] : undefined,
    includeUnscoped: true,
    limit,
  });
  if (!listed.ok) {
    return NextResponse.json({ error: listed.error }, { status: listed.status });
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  const spaceMeta = new Map(
    profiles.map((p) => [p.id, { profile_type: p.profile_type }])
  );
  const spaceNames = Object.fromEntries(
    profiles.map((p) => [p.id, p.display_name])
  );

  const timeline = buildHistoryTimeline(listed.data, filter, spaceMeta);
  const userTz = await getUserTimeZone(supabase, user.id);
  const today = todayLogDate(userTz);

  return NextResponse.json({
    filter,
    today,
    timeline,
    spaceNames,
    events: listed.data,
  });
}

/**
 * Tell Guardian — create event(s) from free text.
 * Does not require choosing a Space first.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text =
    typeof body.text === "string"
      ? body.text.trim()
      : typeof body.content === "string"
        ? body.content.trim()
        : "";
  if (!text) {
    return NextResponse.json(
      { error: "Tell Guardian something to remember." },
      { status: 400 }
    );
  }
  if (text.length > 8000) {
    return NextResponse.json(
      { error: "That note is too long. Keep it under 8,000 characters." },
      { status: 400 }
    );
  }

  const explicitSpaceId =
    typeof body.spaceId === "string" && body.spaceId.trim()
      ? body.spaceId.trim()
      : null;

  const profiles = await listGuardianProfiles(supabase, user.id);
  let spaceId = explicitSpaceId;
  let confidence: number | null = explicitSpaceId ? 1 : null;

  if (!spaceId) {
    const suggestion = suggestSpaceIdFromText(
      text,
      profiles.map((p) => ({ id: p.id, display_name: p.display_name }))
    );
    if (suggestion) {
      spaceId = suggestion.spaceId;
      confidence = suggestion.confidence;
    }
  }

  const inputs = deriveEventsFromTellGuardian({
    userId: user.id,
    text,
    spaceId,
    confidenceScore: confidence,
  });

  const events = [];
  let anyCreated = false;
  for (const input of inputs) {
    const result = await createGuardianEvent(supabase, input);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    if (!result.deduped) anyCreated = true;
    events.push(result.data);
  }

  return NextResponse.json(
    {
      events,
      spaceId,
      spaceSuggested: Boolean(spaceId && !explicitSpaceId),
      deduped: !anyCreated,
    },
    { status: anyCreated ? 201 : 200 }
  );
}
