import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  guardianTimeZoneLabel,
  isValidIanaTimeZone,
} from "@/lib/timezone";
import {
  getUserTimeZoneRow,
  type TimeZoneSource,
} from "@/lib/timezone/server";

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

function parseSource(value: unknown): TimeZoneSource | null {
  if (value === "default" || value === "auto" || value === "manual") {
    return value;
  }
  return null;
}

/** Read the signed-in account timezone. */
export async function GET() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const row = await getUserTimeZoneRow(supabase, user.id);
  return NextResponse.json({
    timeZone: row.time_zone,
    timeZoneSource: row.time_zone_source,
    timeZoneLabel: guardianTimeZoneLabel(row.time_zone),
  });
}

/**
 * Set timezone manually, or auto-detect from the client device.
 * Body: { timeZone: string, source?: "auto" | "manual" }
 * Auto-detect must send the browser IANA zone — the server cannot infer it.
 */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const current = await getUserTimeZoneRow(supabase, user.id);
  const requestedSource = parseSource(body.source);

  let nextZone = current.time_zone;
  let nextSource = current.time_zone_source;

  if (requestedSource === "auto") {
    if (current.time_zone_source !== "manual") {
      if (
        typeof body.timeZone !== "string" ||
        !isValidIanaTimeZone(body.timeZone.trim())
      ) {
        return NextResponse.json(
          { error: "Missing timeZone for auto detect." },
          { status: 400 }
        );
      }
      nextZone = body.timeZone.trim();
      nextSource = "auto";
    }
  } else if (typeof body.timeZone === "string") {
    const candidate = body.timeZone.trim();
    if (!isValidIanaTimeZone(candidate)) {
      return NextResponse.json(
        { error: "Pick a valid timezone." },
        { status: 400 }
      );
    }
    nextZone = candidate;
    nextSource = requestedSource ?? "manual";
  } else {
    return NextResponse.json(
      { error: "Missing timeZone." },
      { status: 400 }
    );
  }

  if (
    nextZone === current.time_zone &&
    nextSource === current.time_zone_source
  ) {
    return NextResponse.json({
      timeZone: current.time_zone,
      timeZoneSource: current.time_zone_source,
      timeZoneLabel: guardianTimeZoneLabel(current.time_zone),
    });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      time_zone: nextZone,
      time_zone_source: nextSource,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    const missingColumn =
      /time_zone/i.test(error.message) &&
      /does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        error: missingColumn
          ? "Timezone isn't set up on this project yet — run migration 0042_user_time_zone.sql in Supabase."
          : "Couldn't save timezone.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    timeZone: nextZone,
    timeZoneSource: nextSource,
    timeZoneLabel: guardianTimeZoneLabel(nextZone),
  });
}
