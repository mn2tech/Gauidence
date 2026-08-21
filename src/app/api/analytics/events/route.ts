import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordProductEvent } from "@/lib/analytics/productEvents";
import { FUNNEL_EVENT_NAMES } from "@/lib/onboarding/events";

export const runtime = "nodejs";

const ALLOWED = new Set<string>(FUNNEL_EVENT_NAMES);

/** Client → durable product_events insert (auth required). */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { event?: string; properties?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event.trim() : "";
  if (!event || event.length > 80) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }
  // Allow known funnel events plus future namespaced events.
  if (!ALLOWED.has(event) && !event.startsWith("guardian_")) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  const properties =
    body.properties && typeof body.properties === "object"
      ? body.properties
      : {};

  await recordProductEvent(supabase, user.id, event, properties);
  return NextResponse.json({ ok: true });
}
