import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import {
  calendarDateInZone,
  formatReminderWhen,
  zonedDateTimeToIso,
} from "@/lib/reminders/time";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

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

/**
 * Create a user reminder for the active (or specified) profile.
 * Body: { title, date: YYYY-MM-DD, time: HH:mm, profileId? }
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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      { error: "Enter what you want to be reminded about." },
      { status: 400 }
    );
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: "Keep the reminder under 200 characters." },
      { status: 400 }
    );
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim() : "09:00";
  const dueAt = zonedDateTimeToIso({ date, time, timeZone: GUARDIAN_TIME_ZONE });
  if (!dueAt) {
    return NextResponse.json(
      { error: "Pick a valid date and time." },
      { status: 400 }
    );
  }

  const dueInstant = new Date(dueAt);
  if (Number.isNaN(dueInstant.getTime())) {
    return NextResponse.json(
      { error: "Pick a valid date and time." },
      { status: 400 }
    );
  }
  // Allow a small skew so "now" still works.
  if (dueInstant.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "Choose a time in the future." },
      { status: 400 }
    );
  }

  let profileId =
    typeof body.profileId === "string" ? body.profileId : null;
  if (profileId) {
    const editable = await requireEditableGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!editable) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
  } else {
    const active = await getActiveGuardianProfile(supabase, user);
    if (!active) {
      return NextResponse.json(
        {
          error:
            "Create a person or space first — open the dashboard and choose who you're helping.",
        },
        { status: 400 }
      );
    }
    profileId = active.id;
  }

  const dueDate = calendarDateInZone(dueInstant, GUARDIAN_TIME_ZONE);

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      document_id: null,
      user_id: user.id,
      profile_id: profileId,
      title,
      due_date: dueDate,
      due_at: dueAt,
      source: "user",
    })
    .select("id, title, due_date, due_at, source, profile_id, created_at")
    .single();

  if (error || !data) {
    console.error("Create reminder failed:", error?.message ?? "unknown");
    return NextResponse.json(
      {
        error:
          error?.message?.includes("due_at") ||
          error?.message?.includes("document_id")
            ? "Reminders aren't set up on this project yet — run migration 0021_user_reminders.sql in Supabase."
            : "Couldn't save that reminder. Please try again.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    reminder: data,
    whenLabel: formatReminderWhen(data.due_at, data.due_date),
  });
}
