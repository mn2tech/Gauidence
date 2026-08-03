import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { listClientRequestAssignees } from "@/lib/client-requests/assignees";

export const runtime = "nodejs";

/** List employees that can be assigned client requests for a business vault. */
export async function GET(request: Request) {
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

  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  let businessId = profileId;
  if (profile.profile_type === "client" && profile.parent_profile_id) {
    businessId = profile.parent_profile_id;
  } else if (
    !isOrgStyleProfile(profile.profile_type) ||
    profile.profile_type === "client"
  ) {
    return NextResponse.json({ assignees: [] });
  }

  const assignees = await listClientRequestAssignees(supabase, businessId);
  return NextResponse.json({ assignees });
}
