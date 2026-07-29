import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listGuardianProfiles,
  setActiveGuardianProfile,
} from "@/lib/profiles/server";
import { PROFILE_CREATE_OPTIONS } from "@/lib/profiles/types";
import {
  computeNeedsOnboarding,
  isOnboardingIntent,
  isSchoolIntent,
  vaultActionForIntent,
  type OnboardingIntent,
  type SchoolIntent,
} from "@/lib/onboarding/intent";
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

const PROFILE_SELECT =
  "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at";

type OnboardingRow = {
  onboarding_intent: string | null;
  onboarding_completed_at: string | null;
  onboarding_skipped: boolean;
};

async function readOnboardingRow(
  supabase: SupabaseClient,
  userId: string
): Promise<{ row: OnboardingRow | null; missingColumn: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_intent, onboarding_completed_at, onboarding_skipped")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingColumn =
      /onboarding_/i.test(error.message) &&
      /does not exist|schema cache/i.test(error.message);
    return { row: null, missingColumn };
  }

  return {
    row: {
      onboarding_intent: (data?.onboarding_intent as string | null) ?? null,
      onboarding_completed_at:
        (data?.onboarding_completed_at as string | null) ?? null,
      onboarding_skipped: Boolean(data?.onboarding_skipped),
    },
    missingColumn: false,
  };
}

function statusPayload(row: OnboardingRow) {
  const intent = isOnboardingIntent(row.onboarding_intent)
    ? row.onboarding_intent
    : null;
  return {
    needsOnboarding: computeNeedsOnboarding(row),
    intent,
    completedAt: row.onboarding_completed_at,
    skipped: row.onboarding_skipped,
  };
}

/** Current first-run onboarding status. */
export async function GET() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const { row, missingColumn } = await readOnboardingRow(supabase, user.id);
  if (missingColumn) {
    return NextResponse.json(
      {
        error:
          "Onboarding isn't set up on this project yet — run migration 0047_onboarding_intent.sql in Supabase.",
        needsOnboarding: false,
        intent: null,
        completedAt: null,
        skipped: false,
      },
      { status: 503 }
    );
  }
  if (!row) {
    return NextResponse.json({
      needsOnboarding: true,
      intent: null,
      completedAt: null,
      skipped: false,
    });
  }
  return NextResponse.json(statusPayload(row));
}

/**
 * Complete or skip first-run intent.
 * Body: { skip: true } | { intent, schoolIntent? }
 */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const skip = body.skip === true;
  let intent: OnboardingIntent | null = null;
  let schoolIntent: SchoolIntent | null = null;

  if (!skip) {
    if (!isOnboardingIntent(body.intent)) {
      return NextResponse.json(
        { error: "Pick what brings you to Guardian." },
        { status: 400 }
      );
    }
    intent = body.intent;
    if (intent === "school") {
      if (!isSchoolIntent(body.schoolIntent)) {
        return NextResponse.json(
          { error: "Choose teacher, student, or parent." },
          { status: 400 }
        );
      }
      schoolIntent = body.schoolIntent;
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      onboarding_intent: skip ? null : intent,
      onboarding_completed_at: now,
      onboarding_skipped: skip,
      updated_at: now,
    })
    .eq("id", user.id);

  if (updateError) {
    const missingColumn =
      /onboarding_/i.test(updateError.message) &&
      /does not exist|schema cache/i.test(updateError.message);
    return NextResponse.json(
      {
        error: missingColumn
          ? "Onboarding isn't set up on this project yet — run migration 0047_onboarding_intent.sql in Supabase."
          : "Couldn't save onboarding choice.",
      },
      { status: 502 }
    );
  }

  let activeProfileId: string | null = null;
  let createdProfileId: string | null = null;

  if (!skip && intent) {
    const action = vaultActionForIntent(intent, schoolIntent);
    if (action.optionId && action.switchToNew) {
      const option = PROFILE_CREATE_OPTIONS.find((o) => o.id === action.optionId);
      const existing = await listGuardianProfiles(supabase, user.id);
      const alreadyHasType = existing.some(
        (p) =>
          p.owner_user_id === user.id &&
          p.profile_type === action.profileType &&
          !p.parent_profile_id
      );

      if (!alreadyHasType) {
        const row = {
          owner_user_id: user.id,
          profile_type: action.profileType,
          display_name: action.displayName,
          relationship:
            action.relationship ?? option?.relationship ?? null,
          parent_profile_id: null,
          is_default: false,
        };

        const admin = createAdminClient();
        const client = admin ?? supabase;
        const { data: created, error: createError } = await client
          .from("guardian_profiles")
          .insert(row)
          .select(PROFILE_SELECT)
          .single();

        if (createError || !created) {
          console.error(
            "Onboarding vault create failed:",
            createError?.code,
            createError?.message
          );
        } else {
          createdProfileId = String(created.id);
          if (admin) {
            await admin.from("guardian_profile_members").upsert(
              {
                profile_id: created.id,
                user_id: user.id,
                role: "owner",
                invited_by: user.id,
              },
              { onConflict: "profile_id,user_id" }
            );
          } else {
            await supabase.from("guardian_profile_members").upsert(
              {
                profile_id: created.id,
                user_id: user.id,
                role: "owner",
                invited_by: user.id,
              },
              { onConflict: "profile_id,user_id" }
            );
          }
          const switched = await setActiveGuardianProfile(
            supabase,
            user.id,
            createdProfileId
          );
          activeProfileId = switched?.id ?? createdProfileId;
          try {
            await refreshUserAwards(user.id, supabase);
          } catch {
            /* non-fatal */
          }
        }
      } else {
        const match = existing.find(
          (p) =>
            p.owner_user_id === user.id &&
            p.profile_type === action.profileType &&
            !p.parent_profile_id
        );
        if (match) {
          const switched = await setActiveGuardianProfile(
            supabase,
            user.id,
            match.id
          );
          activeProfileId = switched?.id ?? match.id;
        }
      }
    }
  }

  const { row } = await readOnboardingRow(supabase, user.id);
  return NextResponse.json({
    ...(row
      ? statusPayload(row)
      : {
          needsOnboarding: false,
          intent,
          completedAt: now,
          skipped: skip,
        }),
    activeProfileId,
    createdProfileId,
  });
}
