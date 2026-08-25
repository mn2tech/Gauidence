import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimarySchoolContext } from "@/lib/mcps-parent/dashboard";
import {
  buildGoogleCalendarUrl,
  buildIcs,
} from "@/lib/mcps-parent/calendar";
import { extractEventDate } from "@/lib/mcps-parent/dates";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
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
  return { supabase, user };
}

type RouteContext = { params: Promise<{ itemId: string }> };

/** Return ICS + Google Calendar links for a published knowledge item. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { itemId } = await context.params;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Admin database client is not configured." },
      { status: 503 }
    );
  }

  const { data: item } = await admin
    .from("knowledge_items")
    .select(
      "id, title, content, school, authority, source_url, effective_date, status"
    )
    .eq("id", itemId)
    .eq("status", "published")
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const parentContext = await getPrimarySchoolContext(
    auth.supabase,
    auth.user.id
  );
  const eventDate = extractEventDate({
    title: item.title as string,
    content: item.content as string,
    effectiveDate: item.effective_date as string | null,
    asOf: new Date(),
  });

  if (!eventDate) {
    return NextResponse.json(
      { error: "This item does not have a date for a calendar event." },
      { status: 400 }
    );
  }

  const payload = {
    title: item.title as string,
    startDate: eventDate,
    allDay: true,
    description: (item.content as string).slice(0, 500),
    location: (item.school as string | null) || parentContext?.school_name || undefined,
    sourceUrl: (item.source_url as string | null) ?? null,
    schoolName:
      (item.school as string | null) || parentContext?.school_name || null,
  };

  const ics = buildIcs(payload);
  const google_url = buildGoogleCalendarUrl(payload);

  return NextResponse.json({
    ok: true,
    event: payload,
    google_url,
    ics,
    filename: `${(item.title as string).slice(0, 40).replace(/\W+/g, "-")}.ics`,
  });
}
