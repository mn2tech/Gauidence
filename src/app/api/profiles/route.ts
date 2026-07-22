import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isGuardianProfileType,
  PROFILE_CREATE_OPTIONS,
  canAttachChildToParent,
  isOrgStyleProfile,
  profileCompanyContext,
  profileTypeLabel,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import {
  getActiveGuardianProfile,
  listGuardianProfiles,
  requireOwnedGuardianProfile,
  setActiveGuardianProfile,
} from "@/lib/profiles/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshUserAwards } from "@/lib/awards/grant";

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

/** List profiles + active profile. */
export async function GET() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  try {
    const [profiles, active, accountRow] = await Promise.all([
      listGuardianProfiles(supabase, user.id),
      getActiveGuardianProfile(supabase, user),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    const accountName =
      accountRow.data?.full_name?.trim() ||
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "") ||
      accountRow.data?.email?.split("@")[0] ||
      user.email?.split("@")[0] ||
      "You";
    return NextResponse.json({
      profiles,
      activeProfileId: active?.id ?? null,
      active,
      accountName,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load profiles." },
      { status: 502 }
    );
  }
}

/** Create a profile, or set active via { action: "switch", profileId }. */
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

  if (body.action === "switch") {
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    const active = await setActiveGuardianProfile(supabase, user.id, profileId);
    if (!active) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
    const profiles = await listGuardianProfiles(supabase, user.id);
    return NextResponse.json({ active, profiles, activeProfileId: active.id });
  }

  const optionId = typeof body.optionId === "string" ? body.optionId : "";
  const option = PROFILE_CREATE_OPTIONS.find((o) => o.id === optionId);
  let profileType: GuardianProfileType =
    option?.profileType ??
    (isGuardianProfileType(body.profileType) ? body.profileType : "other");

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json(
      { error: "Enter a display name for this profile." },
      { status: 400 }
    );
  }

  const parentProfileId =
    typeof body.parentProfileId === "string" ? body.parentProfileId.trim() : "";

  let organizationName =
    typeof body.organizationName === "string"
      ? body.organizationName.trim() || null
      : null;

  let parentId: string | null = null;
  if (parentProfileId) {
    const parent = await requireOwnedGuardianProfile(
      supabase,
      user.id,
      parentProfileId
    );
    if (!parent) {
      return NextResponse.json(
        { error: "Parent profile not found." },
        { status: 400 }
      );
    }

    const requestedType: GuardianProfileType =
      option?.profileType ??
      (isGuardianProfileType(body.profileType) ? body.profileType : profileType);

    // Org panels historically omitted optionId — default employee / client.
    let childType = requestedType;
    if (
      isOrgStyleProfile(parent.profile_type) &&
      !option &&
      !isGuardianProfileType(body.profileType)
    ) {
      childType =
        body.linkedKind === "client" || body.profileType === "client"
          ? "client"
          : "employee";
    }

    if (!canAttachChildToParent(childType, parent.profile_type)) {
      return NextResponse.json(
        {
          error: `A ${profileTypeLabel(childType)} can't be nested under ${
            parent.display_name
          } (${profileTypeLabel(parent.profile_type)}).`,
        },
        { status: 400 }
      );
    }

    profileType = childType;
    if (
      isOrgStyleProfile(parent.profile_type) &&
      (profileType === "employee" || profileType === "client") &&
      !organizationName
    ) {
      organizationName = profileCompanyContext(parent);
    }

    parentId = parent.id;
  }

  const relationship =
    typeof body.relationship === "string"
      ? body.relationship.trim() || null
      : option?.relationship ??
        (parentId ? profileTypeLabel(profileType) : null);

  const row = {
    owner_user_id: user.id,
    profile_type: profileType,
    display_name: displayName,
    relationship,
    date_of_birth:
      typeof body.dateOfBirth === "string" && body.dateOfBirth
        ? body.dateOfBirth
        : null,
    school_name:
      typeof body.schoolName === "string"
        ? body.schoolName.trim() || null
        : null,
    grade_level:
      typeof body.gradeLevel === "string"
        ? body.gradeLevel.trim() || null
        : null,
    business_legal_name:
      typeof body.businessLegalName === "string"
        ? body.businessLegalName.trim() || null
        : null,
    industry:
      typeof body.industry === "string" ? body.industry.trim() || null : null,
    website:
      typeof body.website === "string" ? body.website.trim() || null : null,
    description:
      typeof body.description === "string"
        ? body.description.trim() || null
        : null,
    job_title:
      typeof body.jobTitle === "string" ? body.jobTitle.trim() || null : null,
    department:
      typeof body.department === "string"
        ? body.department.trim() || null
        : null,
    organization_name: organizationName,
    parent_profile_id: parentId,
    is_default: false,
  };

  const existing = await listGuardianProfiles(supabase, user.id);
  if (existing.length === 0 && !parentId) {
    row.is_default = true;
  }

  const profileSelect =
    "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at";

  const admin = createAdminClient();
  // Prefer service-role insert so shared-vault RLS/trigger edge cases can't block owners.
  let created: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;

  if (admin) {
    const { data, error } = await admin
      .from("guardian_profiles")
      .insert(row)
      .select(profileSelect)
      .single();
    if (error || !data) {
      errorMessage = error?.message ?? null;
      console.error(
        "guardian_profiles admin insert failed:",
        error?.code,
        error?.message,
        error?.details,
        error?.hint
      );
    } else {
      created = data as Record<string, unknown>;
      await admin.from("guardian_profile_members").upsert(
        {
          profile_id: created.id,
          user_id: user.id,
          role: "owner",
          invited_by: user.id,
        },
        { onConflict: "profile_id,user_id" }
      );
    }
  } else {
    const { data, error } = await supabase
      .from("guardian_profiles")
      .insert(row)
      .select(profileSelect)
      .single();
    if (error || !data) {
      errorMessage = error?.message ?? null;
      console.error(
        "guardian_profiles insert failed:",
        error?.code,
        error?.message,
        error?.details,
        error?.hint
      );
    } else {
      created = data as Record<string, unknown>;
    }
  }

  if (!created?.id) {
    return NextResponse.json(
      {
        error: errorMessage?.includes("Parent profile")
          ? "That parent vault isn't available. Refresh and try again."
          : errorMessage
            ? `Couldn't create profile: ${errorMessage}`
            : "Couldn't create profile. Run migration 0027 in Supabase, then try again.",
      },
      { status: 502 }
    );
  }

  const createdId = String(created.id);
  const switchTo = body.switchTo !== false;
  if (switchTo) {
    await setActiveGuardianProfile(supabase, user.id, createdId);
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  const active = await getActiveGuardianProfile(supabase, user);
  const newlyGranted = await refreshUserAwards(user.id, supabase);
  return NextResponse.json(
    { profile: created, profiles, active, newlyGranted },
    { status: 201 }
  );
}
