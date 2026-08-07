import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import { getUserTimeZone } from "@/lib/timezone/server";
import {
  calendarDateInZone,
  formatReminderWhen,
  normalizeReminderTime,
  zonedDateTimeToIso,
} from "@/lib/reminders/time";

export const runtime = "nodejs";

const REMINDER_SELECT =
  "id, title, due_date, due_at, source, profile_id, created_at";

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

function reminderSaveError(message: string | undefined): string {
  const msg = message ?? "";
  if (
    msg.includes("due_at") ||
    msg.includes("document_id") ||
    msg.includes("alerts_document_or_user_chk")
  ) {
    return "Reminders aren't set up on this project yet — run migration 0021_user_reminders.sql in Supabase.";
  }
  if (msg.includes("row-level security")) {
    return "You can't add reminders for this vault. Switch to a vault you can edit.";
  }
  return "Couldn't save that reminder. Please try again.";
}

/**
 * Create a user reminder for the active (or specified) profile.
 * Body: { title, date: YYYY-MM-DD, time: HH:mm, profileId? }
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const userTz = await getUserTimeZone(supabase, user.id);

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
  const time = normalizeReminderTime(body.time);
  const dueAt = zonedDateTimeToIso({ date, time, timeZone: userTz });
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
    typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!profileId) {
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

  const editable = await requireEditableGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!editable) {
    return NextResponse.json(
      {
        error:
          "You can't add reminders for this vault. Switch to a vault you can edit.",
      },
      { status: 403 }
    );
  }

  const dueDate = calendarDateInZone(dueInstant, userTz);
  const row = {
    document_id: null,
    user_id: user.id,
    profile_id: profileId,
    title,
    due_date: dueDate,
    due_at: dueAt,
    source: "user",
  };

  const admin = createAdminClient();
  const writer = admin ?? supabase;
  const { data, error } = await writer
    .from("alerts")
    .insert(row)
    .select(REMINDER_SELECT)
    .single();

  if (error || !data) {
    console.error(
      "Create reminder failed:",
      error?.code,
      error?.message ?? "unknown",
      error?.details,
      error?.hint
    );
    return NextResponse.json(
      { error: reminderSaveError(error?.message) },
      { status: 502 }
    );
  }

  return NextResponse.json({
    reminder: data,
    whenLabel: formatReminderWhen(data.due_at, data.due_date, userTz),
  });
}
