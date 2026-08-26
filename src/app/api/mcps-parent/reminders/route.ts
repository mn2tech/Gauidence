import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDays, parseYmd, toYmd } from "@/lib/mcps-parent/dates";

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

const OFFSETS = {
  "1_day": 1,
  "2_days": 2,
  "1_week": 7,
} as const;

/** Create a simple Remind Me reminder for a dated knowledge item. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    knowledge_item_id?: string;
    event_date?: string;
    offset?: string;
    parent_school_context_id?: string | null;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const eventDate = typeof body.event_date === "string" ? body.event_date : "";
  const offsetKey =
    typeof body.offset === "string" ? body.offset : "1_day";
  const daysBefore =
    OFFSETS[offsetKey as keyof typeof OFFSETS] ?? OFFSETS["1_day"];

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  const event = parseYmd(eventDate);
  if (!event) {
    return NextResponse.json(
      { error: "A valid event_date (YYYY-MM-DD) is required." },
      { status: 400 }
    );
  }

  let reminderDate = addDays(event, -daysBefore);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (reminderDate < today) {
    reminderDate = today;
  }

  const { data, error } = await auth.supabase
    .from("parent_knowledge_reminders")
    .insert({
      user_id: auth.user.id,
      knowledge_item_id:
        typeof body.knowledge_item_id === "string"
          ? body.knowledge_item_id
          : null,
      parent_school_context_id:
        typeof body.parent_school_context_id === "string"
          ? body.parent_school_context_id
          : null,
      title: title.slice(0, 200),
      reminder_date: toYmd(reminderDate),
      event_date: toYmd(event),
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reminder: data });
}

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from("parent_knowledge_reminders")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("reminder_date", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reminders: data ?? [] });
}
