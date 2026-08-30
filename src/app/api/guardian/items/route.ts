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
  zonedDateTimeToIso,
} from "@/lib/reminders/time";
import { insertManualGuardianItem } from "@/lib/guardian-items/persist";

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
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

/**
 * Create a manual Guardian Today item from chat (Add to Today).
 * Body: { title, profileId?, description?, date?: YYYY-MM-DD }
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
      { error: "Enter what to add to Today." },
      { status: 400 }
    );
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: "Keep the title under 200 characters." },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : "";

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
          "You can't add Today items for this vault. Switch to a vault you can edit.",
      },
      { status: 403 }
    );
  }

  const today = calendarDateInZone(new Date(), userTz);
  const eventDate =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
      ? body.date.trim()
      : today;

  // Due later today so it stays actionable on Watch / Needs Attention.
  const dueAt =
    zonedDateTimeToIso({ date: eventDate, time: "18:00", timeZone: userTz }) ??
    new Date().toISOString();

  const admin = createAdminClient();
  const writer = admin ?? supabase;
  const item = await insertManualGuardianItem(writer, {
    userId: user.id,
    spaceId: profileId,
    title,
    dueAt,
    eventDate,
    type: "task",
    description: description || null,
  });

  if (!item) {
    return NextResponse.json(
      { error: "Couldn't add that to Today. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    item: {
      id: item.id,
      title: item.title,
      event_date: item.event_date,
      type: item.type,
    },
  });
}
