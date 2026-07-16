import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireOwnedGuardianProfile,
} from "@/lib/profiles/server";
import { isValidLogDate, todayLogDate } from "@/lib/logs/types";

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

const SELECT =
  "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at";

/** List / search logs for a profile (defaults to active). */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  let profileId = url.searchParams.get("profileId");
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
  } else {
    const owned = await requireOwnedGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!owned) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
  }

  let query = supabase
    .from("daily_logs")
    .select(SELECT)
    .eq("owner_user_id", user.id)
    .eq("profile_id", profileId)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (category) query = query.eq("category", category);
  if (isValidLogDate(from)) query = query.gte("log_date", from);
  if (isValidLogDate(to)) query = query.lte("log_date", to);
  if (tag) query = query.contains("tags", [tag]);
  if (q) {
    // PostgREST or() filter on title/content
    const safe = q.replace(/[%_,]/g, " ").slice(0, 80);
    query = query.or(`content.ilike.%${safe}%,title.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Couldn't load Daily Logs." },
      { status: 502 }
    );
  }

  return NextResponse.json({ logs: data ?? [], profileId });
}

/** Create a Daily Log or Quick Log for the active (or specified) profile. */
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

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json(
      { error: "Enter something for this Daily Log." },
      { status: 400 }
    );
  }
  if (content.length > 8000) {
    return NextResponse.json(
      { error: "That log is too long. Keep it under 8,000 characters." },
      { status: 400 }
    );
  }

  let profileId =
    typeof body.profileId === "string" ? body.profileId : null;
  if (profileId) {
    const owned = await requireOwnedGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!owned) {
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

  const quick = body.quick === true;
  const logDate = isValidLogDate(body.logDate)
    ? body.logDate
    : todayLogDate();

  const tags = Array.isArray(body.tags)
    ? body.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 200) || null : null;

  const { data, error } = await supabase
    .from("daily_logs")
    .insert({
      owner_user_id: user.id,
      profile_id: profileId,
      log_date: logDate,
      title,
      content,
      category:
        !quick && typeof body.category === "string"
          ? body.category.trim() || null
          : null,
      tags: quick ? [] : tags,
      source_type: quick ? "quick_log" : "user_entered",
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't save Daily Log." },
      { status: 502 }
    );
  }

  return NextResponse.json({ log: data }, { status: 201 });
}
