import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  listGuardianProfiles,
  requireOwnedGuardianProfile,
  setActiveGuardianProfile,
} from "@/lib/profiles/server";
import {
  canAttachChildToParent,
  isGroupStyleProfile,
  isGuardianProfileType,
} from "@/lib/profiles/types";

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

type Ctx = { params: Promise<{ id: string }> };

/** Update profile fields or set as default. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, id);
  if (!owned) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.setDefault === true) {
    await supabase
      .from("guardian_profiles")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("owner_user_id", user.id)
      .neq("id", id);
    const { data, error } = await supabase
      .from("guardian_profiles")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select(
        "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at"
      )
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Couldn't update default profile." },
        { status: 502 }
      );
    }
    await setActiveGuardianProfile(supabase, user.id, id);
    const profiles = await listGuardianProfiles(supabase, user.id);
    return NextResponse.json({ profile: data, profiles });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    patch.display_name = body.displayName.trim();
  }
  if (isGuardianProfileType(body.profileType)) {
    patch.profile_type = body.profileType;
  }
  if (body.relationship !== undefined) {
    patch.relationship =
      typeof body.relationship === "string"
        ? body.relationship.trim() || null
        : null;
  }
  if (body.dateOfBirth !== undefined) {
    patch.date_of_birth =
      typeof body.dateOfBirth === "string" && body.dateOfBirth
        ? body.dateOfBirth
        : null;
  }
  if (typeof body.schoolName === "string") {
    patch.school_name = body.schoolName.trim() || null;
  }
  if (typeof body.gradeLevel === "string") {
    patch.grade_level = body.gradeLevel.trim() || null;
  }
  if (typeof body.businessLegalName === "string") {
    patch.business_legal_name = body.businessLegalName.trim() || null;
  }
  if (typeof body.industry === "string") {
    patch.industry = body.industry.trim() || null;
  }
  if (typeof body.website === "string") {
    patch.website = body.website.trim() || null;
  }
  if (typeof body.description === "string") {
    patch.description = body.description.trim() || null;
  }
  if (typeof body.jobTitle === "string") {
    patch.job_title = body.jobTitle.trim() || null;
  }
  if (typeof body.department === "string") {
    patch.department = body.department.trim() || null;
  }
  if (typeof body.organizationName === "string") {
    patch.organization_name = body.organizationName.trim() || null;
  }
  if (body.avatarUrl !== undefined) {
    patch.avatar_url =
      typeof body.avatarUrl === "string" ? body.avatarUrl.trim() || null : null;
  }

  if (body.parentProfileId !== undefined) {
    if (body.parentProfileId === null || body.parentProfileId === "") {
      if (isGroupStyleProfile(owned.profile_type)) {
        return NextResponse.json(
          { error: "Container profiles cannot be nested under another profile." },
          { status: 400 }
        );
      }
      patch.parent_profile_id = null;
    } else if (typeof body.parentProfileId === "string") {
      const parentId = body.parentProfileId.trim();
      if (parentId === id) {
        return NextResponse.json(
          { error: "A profile cannot be nested under itself." },
          { status: 400 }
        );
      }
      if (isGroupStyleProfile(owned.profile_type)) {
        return NextResponse.json(
          { error: "Container profiles cannot be nested under another profile." },
          { status: 400 }
        );
      }
      const parent = await requireOwnedGuardianProfile(
        supabase,
        user.id,
        parentId
      );
      if (!parent) {
        return NextResponse.json(
          { error: "Parent profile not found." },
          { status: 400 }
        );
      }
      if (
        !canAttachChildToParent(owned.profile_type, parent.profile_type)
      ) {
        return NextResponse.json(
          {
            error: `This ${owned.profile_type} profile cannot be moved under that ${parent.profile_type} profile.`,
          },
          { status: 400 }
        );
      }
      patch.parent_profile_id = parent.id;
    } else {
      return NextResponse.json(
        { error: "Invalid parentProfileId." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("guardian_profiles")
    .update(patch)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(
      "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update profile." },
      { status: 502 }
    );
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  return NextResponse.json({ profile: data, profiles });
}

/**
 * Delete a profile. Requires confirmDeleteData when documents exist.
 * Cascades vault data via FK; removes storage objects for this profile's docs.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, id);
  if (!owned) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (owned.is_default) {
    const profiles = await listGuardianProfiles(supabase, user.id);
    if (profiles.length > 1) {
      return NextResponse.json(
        {
          error:
            "Set another profile as default before deleting the default profile.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "You can't delete your only profile." },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", id)
    .eq("user_id", user.id);

  const docCount = count ?? 0;
  const url = new URL(request.url);
  const confirm =
    url.searchParams.get("confirmDeleteData") === "true" ||
    url.searchParams.get("confirm") === "true";

  if (docCount > 0 && !confirm) {
    return NextResponse.json(
      {
        error: "This profile contains documents and Guardian data.",
        documentCount: docCount,
        requiresConfirmation: true,
      },
      { status: 409 }
    );
  }

  if (docCount > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("file_path")
      .eq("profile_id", id)
      .eq("user_id", user.id);
    const paths = (docs ?? [])
      .map((d) => d.file_path)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      await supabase.storage.from("documents").remove(paths);
    }
  }

  const { error } = await supabase
    .from("guardian_profiles")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't delete profile." },
      { status: 502 }
    );
  }

  const active = await getActiveGuardianProfile(supabase, user);
  const profiles = await listGuardianProfiles(supabase, user.id);
  return NextResponse.json({ ok: true, profiles, active });
}
