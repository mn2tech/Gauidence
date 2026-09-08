import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  associateGuardianEventSpace,
  getGuardianEvent,
  updateGuardianEventStatus,
} from "@/lib/guardian-events/repository";
import { toHistoryEventCard } from "@/lib/guardian-events/history";
import { getGuardianEventSourceRef } from "@/lib/guardian-events/provenance";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { isGuardianEventStatus } from "@/lib/guardian-events/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string }> };

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

/** Event detail + source provenance. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const result = await getGuardianEvent(supabase, {
    userId: user.id,
    eventId: id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  const space = result.data.space_id
    ? profiles.find((p) => p.id === result.data!.space_id)
    : null;

  // Optional Daily Log source body for provenance panel
  let sourceDailyLog: {
    id: string;
    log_date: string;
    title: string | null;
    content: string;
  } | null = null;
  if (
    result.data.source_type === "daily_log" &&
    result.data.source_id
  ) {
    const { data: log } = await supabase
      .from("daily_logs")
      .select("id, log_date, title, content")
      .eq("id", result.data.source_id)
      .maybeSingle();
    if (log) {
      sourceDailyLog = {
        id: String(log.id),
        log_date: String(log.log_date),
        title: log.title == null ? null : String(log.title),
        content: String(log.content ?? ""),
      };
    }
  }

  return NextResponse.json({
    event: result.data,
    card: toHistoryEventCard(result.data),
    source: getGuardianEventSourceRef(result.data),
    spaceName: space?.display_name ?? null,
    sourceDailyLog,
  });
}

/** Update status or associate a Space. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.spaceId === "string" && body.spaceId.trim()) {
    const associated = await associateGuardianEventSpace(supabase, {
      userId: user.id,
      eventId: id,
      spaceId: body.spaceId.trim(),
      confidenceScore:
        typeof body.confidenceScore === "number" ? body.confidenceScore : 1,
    });
    if (!associated.ok) {
      return NextResponse.json(
        { error: associated.error },
        { status: associated.status }
      );
    }
    return NextResponse.json({ event: associated.data });
  }

  if (isGuardianEventStatus(body.status)) {
    const updated = await updateGuardianEventStatus(supabase, {
      userId: user.id,
      eventId: id,
      status: body.status,
    });
    if (!updated.ok) {
      return NextResponse.json(
        { error: updated.error },
        { status: updated.status }
      );
    }
    return NextResponse.json({ event: updated.data });
  }

  return NextResponse.json(
    { error: "Provide status or spaceId to update." },
    { status: 400 }
  );
}
