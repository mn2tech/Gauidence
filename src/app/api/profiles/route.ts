import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isGuardianProfileType,
  PROFILE_CREATE_OPTIONS,
  canHaveLinkedEmployees,
  profileCompanyContext,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import {
  ensureDefaultGuardianProfile,
  getActiveGuardianProfile,
  listGuardianProfiles,
  requireOwnedGuardianProfile,
  setActiveGuardianProfile,
} from "@/lib/profiles/server";

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
    await ensureDefaultGuardianProfile(supabase, user);
    const [profiles, active] = await Promise.all([
      listGuardianProfiles(supabase, user.id),
      getActiveGuardianProfile(supabase, user),
    ]);
    return NextResponse.json({ profiles, activeProfileId: active.id, active });
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
    if (!parent || !canHaveLinkedEmployees(parent.profile_type)) {
      return NextResponse.json(
        { error: "Employees can only be linked to a business or nonprofit." },
        { status: 400 }
      );
    }
    parentId = parent.id;
    profileType = "employee";
    if (!organizationName) {
      organizationName = profileCompanyContext(parent);
    }
  }

  const relationship =
    typeof body.relationship === "string"
      ? body.relationship.trim() || null
      : option?.relationship ?? (parentId ? "Employee" : null);

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

  const { data: created, error } = await supabase
    .from("guardian_profiles")
    .insert(row)
    .select(
      "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at"
    )
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: "Couldn't create profile." },
      { status: 502 }
    );
  }

  const switchTo = body.switchTo !== false;
  if (switchTo) {
    await setActiveGuardianProfile(supabase, user.id, created.id);
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  const active = await getActiveGuardianProfile(supabase, user);
  return NextResponse.json({ profile: created, profiles, active }, { status: 201 });
}
