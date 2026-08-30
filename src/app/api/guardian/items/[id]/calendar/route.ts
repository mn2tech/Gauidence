import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleCalendarUrl,
  buildIcs,
} from "@/lib/mcps-parent/calendar";
import { effectiveCalendarDate } from "@/lib/guardian-items/dates";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * ICS + Google Calendar URL for a Guardian item (phone calendar download).
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: item } = await supabase
    .from("guardian_items")
    .select(
      "id, user_id, title, description, type, event_date, due_at, space_id, source_document_id, source_excerpt"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const timeZone = await getUserTimeZone(supabase, user.id);
  const startDate = effectiveCalendarDate({
    eventDate: item.event_date,
    dueAt: item.due_at,
    timeZone,
    calendarDateInZone: calendarDateInUserZone,
  });

  if (!startDate) {
    return NextResponse.json(
      { error: "This item does not have a date for a calendar event." },
      { status: 400 }
    );
  }

  const base = appBaseUrl();
  const sourceUrl = item.source_document_id
    ? `${base}/documents/${item.source_document_id}`
    : `${base}${SIMPLE_HOME_PATH}`;

  const payload = {
    title: String(item.title),
    startDate,
    allDay: true as const,
    description: [
      item.description?.trim() || item.source_excerpt?.trim() || "",
      `Type: ${item.type}`,
      "Added from Guardian Today",
    ]
      .filter(Boolean)
      .join("\n"),
    sourceUrl,
  };

  const ics = buildIcs(payload);
  const google_url = buildGoogleCalendarUrl(payload);
  const filename = `${String(item.title)
    .slice(0, 40)
    .replace(/\W+/g, "-")
    .replace(/^-|-$/g, "") || "guardian-event"}.ics`;

  return NextResponse.json({
    ok: true,
    event: payload,
    google_url,
    ics,
    filename,
  });
}
