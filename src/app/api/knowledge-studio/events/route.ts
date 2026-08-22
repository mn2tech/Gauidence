import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Service role is not configured" }, { status: 503 }) };
  return { admin, user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.admin.from("knowledge_events").select("*").eq("organization_slug", "crossroadsconnect").order("start_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json();
  if (!body.title?.trim() || !body.start_at) {
    return NextResponse.json({ error: "Title and start date/time are required" }, { status: 400 });
  }
  const row = {
    organization_slug: "crossroadsconnect",
    title: body.title.trim(),
    description: body.description?.trim() || null,
    start_at: body.start_at,
    end_at: body.end_at || null,
    location: body.location?.trim() || null,
    organizer: body.organizer?.trim() || "Crossroads Connect",
    contact: body.contact?.trim() || null,
    rsvp_url: body.rsvp_url?.trim() || null,
    cost: body.cost?.trim() || null,
    audience: body.audience?.trim() || null,
    source_label: body.source_label?.trim() || "Knowledge Studio",
    source_url: body.source_url?.trim() || null,
    lifecycle_status: body.lifecycle_status || "draft",
    visibility: body.visibility || "private",
    published_at: body.lifecycle_status === "published" ? new Date().toISOString() : null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await auth.admin.from("knowledge_events").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Event id is required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["title","description","start_at","end_at","location","organizer","contact","rsvp_url","cost","audience","source_label","source_url","lifecycle_status","visibility"]) {
    if (key in body) patch[key] = body[key] || null;
  }
  if (body.lifecycle_status === "published") patch.published_at = new Date().toISOString();
  const { data, error } = await auth.admin.from("knowledge_events").update(patch).eq("id", body.id).eq("organization_slug", "crossroadsconnect").select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
