import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ensureSummitPrivateCapture,
  loadPrivateCapture,
  updatePrivateCapture,
} from "@/lib/summit-space/privateCapture";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

async function requireSummitOwner(slug: string) {
  const supabase = await createClient();
  if (!supabase) {
    return { error: "Guardian is not configured", status: 503 as const };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in required", status: 401 as const };
  }

  const { data: space } = await supabase
    .from("summit_spaces")
    .select("profile_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!space?.profile_id) {
    return { error: "Summit space not linked to a Guardian profile", status: 403 as const };
  }

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", space.profile_id)
    .maybeSingle();

  if (!profile || profile.owner_user_id !== user.id) {
    return { error: "Not authorized", status: 403 as const };
  }

  return { user, profileId: space.profile_id };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const auth = await requireSummitOwner(slug);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  await ensureSummitPrivateCapture(admin, slug);
  const capture = await loadPrivateCapture(admin, slug);

  return NextResponse.json({ capture });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const auth = await requireSummitOwner(slug);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    updates?: Record<string, unknown>;
  };

  if (!body.id || !body.updates) {
    return NextResponse.json({ error: "Missing id or updates" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const updated = await updatePrivateCapture(admin, body.id, body.updates);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ capture: updated });
}
