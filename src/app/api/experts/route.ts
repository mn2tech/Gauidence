import { NextResponse } from "next/server";
import { getExpertCatalog } from "@/lib/experts/load-expert";
import { getExpertPublicById } from "@/lib/experts/load-expert";
import {
  isExpertAuthed,
  listUserExpertsForUser,
  requireExpertUser,
} from "@/lib/experts/server";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const experts = getExpertCatalog().map(
    ({ validationError: _validationError, ...item }) => item
  );
  const installations = await listUserExpertsForUser(auth.supabase, auth.user.id);

  return NextResponse.json({ experts, installations });
}

export async function POST(request: Request) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const expertId = typeof body.expertId === "string" ? body.expertId.trim() : "";
  const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!expertId || !profileId) {
    return NextResponse.json(
      { error: "expertId and profileId are required." },
      { status: 400 }
    );
  }

  const catalogItem = getExpertCatalog().find((e) => e.id === expertId);
  if (!catalogItem || catalogItem.effectiveStatus === "unavailable") {
    return NextResponse.json({ error: "Expert not found." }, { status: 404 });
  }

  if (
    catalogItem.effectiveStatus === "coming-soon" ||
    catalogItem.effectiveStatus === "archived"
  ) {
    return NextResponse.json(
      { error: "This expert is not available for installation." },
      { status: 403 }
    );
  }

  const publicExpert = getExpertPublicById(expertId);
  if (!publicExpert) {
    return NextResponse.json({ error: "Expert not found." }, { status: 404 });
  }

  const { requireAccessibleGuardianProfile } = await import("@/lib/profiles/server");
  const profile = await requireAccessibleGuardianProfile(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const { data: existing } = await auth.supabase
    .from("user_experts")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("profile_id", profileId)
    .eq("expert_id", expertId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "This expert is already installed for that profile.", userExpertId: existing.id },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("user_experts")
    .insert({
      user_id: auth.user.id,
      profile_id: profileId,
      expert_id: expertId,
      expert_version: catalogItem.version,
      status: "active",
      installed_at: now,
      last_opened_at: now,
      updated_at: now,
    })
    .select("id, user_id, profile_id, expert_id, expert_version, status, installed_at, last_opened_at, preferences, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't install expert." },
      { status: 502 }
    );
  }

  const { recordExpertActivity } = await import("@/lib/experts/server");
  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: data.id,
    activityType: "expert_installed",
    contentId: expertId,
  });

  return NextResponse.json({ installation: data }, { status: 201 });
}
