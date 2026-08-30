import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listGuardianProfiles,
  setActiveGuardianProfile,
} from "@/lib/profiles/server";
import {
  GUARDIAN_PROFILE_SELECT,
  PROFILE_CREATE_OPTIONS,
} from "@/lib/profiles/types";
import {
  computeNeedsOnboarding,
  isOnboardingIntent,
  isSchoolIntent,
  vaultActionForIntent,
  type OnboardingIntent,
  type SchoolIntent,
} from "@/lib/onboarding/intent";
import {
  isActivationStep,
  type ActivationStep,
} from "@/lib/onboarding/activation";
import { refreshUserAwards } from "@/lib/awards/grant";
import { recordProductEvent } from "@/lib/analytics/productEvents";

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

type OnboardingRow = {
  onboarding_intent: string | null;
  onboarding_completed_at: string | null;
  onboarding_skipped: boolean;
  onboarding_step: string | null;
  first_value_reached_at: string | null;
  full_name: string | null;
  email: string | null;
};

async function readOnboardingRow(
  supabase: SupabaseClient,
  userId: string
): Promise<{ row: OnboardingRow | null; missingColumn: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "onboarding_intent, onboarding_completed_at, onboarding_skipped, onboarding_step, first_value_reached_at, full_name, email"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingColumn =
      /onboarding_|first_value/i.test(error.message) &&
      /does not exist|schema cache/i.test(error.message);
    return { row: null, missingColumn };
  }

  return {
    row: {
      onboarding_intent: (data?.onboarding_intent as string | null) ?? null,
      onboarding_completed_at:
        (data?.onboarding_completed_at as string | null) ?? null,
      onboarding_skipped: Boolean(data?.onboarding_skipped),
      onboarding_step: (data?.onboarding_step as string | null) ?? null,
      first_value_reached_at:
        (data?.first_value_reached_at as string | null) ?? null,
      full_name: (data?.full_name as string | null) ?? null,
      email: (data?.email as string | null) ?? null,
    },
    missingColumn: false,
  };
}

function statusPayload(row: OnboardingRow) {
  const intent = isOnboardingIntent(row.onboarding_intent)
    ? row.onboarding_intent
    : null;
  const step = isActivationStep(row.onboarding_step)
    ? row.onboarding_step
    : row.onboarding_completed_at
      ? ("completed" as ActivationStep)
      : ("welcome" as ActivationStep);

  const greetName =
    row.full_name?.trim().split(/\s+/)[0] ||
    row.email?.split("@")[0] ||
    null;

  return {
    needsOnboarding: computeNeedsOnboarding(row),
    intent,
    completedAt: row.onboarding_completed_at,
    skipped: row.onboarding_skipped,
    step,
    firstValueReachedAt: row.first_value_reached_at,
    greetName,
  };
}

async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
) {
  const now = new Date().toISOString();
  return supabase
    .from("profiles")
    .update({ ...patch, updated_at: now })
    .eq("id", userId);
}

/**
 * Convert or create the first Space for activation.
 * Prefers updating the default personal Space so Free stays at 1 Space.
 */
async function ensureActivationSpace(args: {
  supabase: SupabaseClient;
  userId: string;
  intent: OnboardingIntent;
  schoolIntent: SchoolIntent | null;
  workspaceName: string | null;
  description: string | null;
}): Promise<{ activeProfileId: string | null; createdProfileId: string | null }> {
  const action = vaultActionForIntent(args.intent, args.schoolIntent);
  const displayName = args.workspaceName || action.displayName;
  const existing = await listGuardianProfiles(args.supabase, args.userId);
  const ownedTop = existing.filter(
    (p) => p.owner_user_id === args.userId && !p.parent_profile_id
  );

  const admin = createAdminClient();
  const client = admin ?? args.supabase;

  // Prefer a single Space: convert the default personal vault when possible.
  const convertible = ownedTop.find(
    (p) =>
      p.profile_type === "personal" ||
      p.is_default ||
      ownedTop.length === 1
  );

  if (convertible && ownedTop.length <= 1) {
    const { data: updated, error } = await client
      .from("guardian_profiles")
      .update({
        profile_type: action.profileType,
        display_name: displayName,
        relationship: action.relationship ?? convertible.relationship,
        description: args.description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", convertible.id)
      .select(GUARDIAN_PROFILE_SELECT)
      .single();

    if (!error && updated) {
      const switched = await setActiveGuardianProfile(
        args.supabase,
        args.userId,
        String(updated.id)
      );
      return {
        activeProfileId: switched?.id ?? String(updated.id),
        createdProfileId: null,
      };
    }
  }

  const alreadyHasType = ownedTop.some(
    (p) => p.profile_type === action.profileType
  );
  if (alreadyHasType) {
    const match = ownedTop.find((p) => p.profile_type === action.profileType)!;
    if (args.workspaceName || args.description) {
      await client
        .from("guardian_profiles")
        .update({
          display_name: displayName,
          description: args.description ?? match.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.id);
    }
    const switched = await setActiveGuardianProfile(
      args.supabase,
      args.userId,
      match.id
    );
    return {
      activeProfileId: switched?.id ?? match.id,
      createdProfileId: null,
    };
  }

  if (!action.optionId && action.profileType === "personal") {
    const personal = ownedTop.find((p) => p.profile_type === "personal");
    if (personal) {
      await client
        .from("guardian_profiles")
        .update({
          display_name: displayName,
          description: args.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", personal.id);
      const switched = await setActiveGuardianProfile(
        args.supabase,
        args.userId,
        personal.id
      );
      return {
        activeProfileId: switched?.id ?? personal.id,
        createdProfileId: null,
      };
    }
  }

  const option = PROFILE_CREATE_OPTIONS.find((o) => o.id === action.optionId);
  const row = {
    owner_user_id: args.userId,
    profile_type: action.profileType,
    display_name: displayName,
    relationship: action.relationship ?? option?.relationship ?? null,
    description: args.description,
    parent_profile_id: null,
    is_default: ownedTop.length === 0,
  };

  const { data: created, error: createError } = await client
    .from("guardian_profiles")
    .insert(row)
    .select(GUARDIAN_PROFILE_SELECT)
    .single();

  if (createError || !created) {
    console.error(
      "Onboarding vault create failed:",
      createError?.code,
      createError?.message
    );
    return { activeProfileId: null, createdProfileId: null };
  }

  const createdProfileId = String(created.id);
  await client.from("guardian_profile_members").upsert(
    {
      profile_id: created.id,
      user_id: args.userId,
      role: "owner",
      invited_by: args.userId,
    },
    { onConflict: "profile_id,user_id" }
  );

  const switched = await setActiveGuardianProfile(
    args.supabase,
    args.userId,
    createdProfileId
  );
  try {
    await refreshUserAwards(args.userId, args.supabase);
  } catch {
    /* non-fatal */
  }

  return {
    activeProfileId: switched?.id ?? createdProfileId,
    createdProfileId,
  };
}

/** Current first-run onboarding status. */
export async function GET() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const { row, missingColumn } = await readOnboardingRow(supabase, user.id);
  if (missingColumn) {
    // Fall back without new columns (migration not applied).
    const legacy = await supabase
      .from("profiles")
      .select("onboarding_intent, onboarding_completed_at, onboarding_skipped, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    if (legacy.error) {
      return NextResponse.json(
        {
          error:
            "Onboarding isn't set up on this project yet — run migration 0047_onboarding_intent.sql in Supabase.",
          needsOnboarding: false,
          intent: null,
          completedAt: null,
          skipped: false,
          step: "completed",
          firstValueReachedAt: null,
          greetName: null,
        },
        { status: 503 }
      );
    }
    const r = legacy.data;
    return NextResponse.json(
      statusPayload({
        onboarding_intent: (r?.onboarding_intent as string | null) ?? null,
        onboarding_completed_at:
          (r?.onboarding_completed_at as string | null) ?? null,
        onboarding_skipped: Boolean(r?.onboarding_skipped),
        onboarding_step: null,
        first_value_reached_at: null,
        full_name: (r?.full_name as string | null) ?? null,
        email: (r?.email as string | null) ?? null,
      })
    );
  }
  if (!row) {
    return NextResponse.json({
      needsOnboarding: true,
      intent: null,
      completedAt: null,
      skipped: false,
      step: "welcome",
      firstValueReachedAt: null,
      greetName: null,
    });
  }
  return NextResponse.json(statusPayload(row));
}

/**
 * Activation funnel updates.
 *
 * Body shapes:
 * - { skip: true }
 * - { action: "select_category", intent, schoolIntent? }
 * - { action: "create_space", workspaceName?, description?, intent?, schoolIntent? }
 * - { action: "first_item_added" }
 * - { action: "first_value" }
 * - { action: "complete" }
 * - Legacy: { intent, schoolIntent?, workspaceName? } → create space + complete (coach)
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

  const action =
    typeof body.action === "string" ? body.action : body.skip === true ? "skip" : null;

  // ── Soft exit after Space exists (no full skip before Space) ────────
  if (action === "skip" || body.skip === true) {
    const { row: current } = await readOnboardingRow(supabase, user.id);
    const step = current?.onboarding_step;
    const pastSpace =
      step === "add_knowledge" ||
      step === "first_value" ||
      step === "ask_gideon" ||
      step === "completed" ||
      Boolean(current?.onboarding_intent);

    if (!pastSpace) {
      return NextResponse.json(
        {
          error:
            "Pick what Guardian should help with and create your Space first.",
        },
        { status: 400 }
      );
    }

    // Count as completed-with-Space, not abandoned skip.
    const now = new Date().toISOString();
    const { error } = await updateProfile(supabase, user.id, {
      onboarding_completed_at: now,
      onboarding_skipped: false,
      onboarding_step: "completed",
    });
    if (error) {
      return NextResponse.json(
        { error: "Couldn't finish setup." },
        { status: 502 }
      );
    }
    await recordProductEvent(supabase, user.id, "coach_completed", {
      deferredKnowledge: true,
    });
    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json({
      ...(row ? statusPayload(row) : { needsOnboarding: false, skipped: false }),
      activeProfileId: null,
      createdProfileId: null,
    });
  }

  // ── Select category (welcome → create_space) ────────────────────────
  if (action === "select_category") {
    if (!isOnboardingIntent(body.intent)) {
      return NextResponse.json(
        { error: "Pick what Guardian should help you manage." },
        { status: 400 }
      );
    }
    let schoolIntent: SchoolIntent | null = null;
    if (body.intent === "school") {
      if (!isSchoolIntent(body.schoolIntent)) {
        return NextResponse.json(
          { error: "Choose teacher, student, or parent." },
          { status: 400 }
        );
      }
      schoolIntent = body.schoolIntent;
    }
    const { error } = await updateProfile(supabase, user.id, {
      onboarding_intent: body.intent,
      onboarding_skipped: false,
      onboarding_step: "create_space",
      onboarding_completed_at: null,
    });
    if (error) {
      return NextResponse.json(
        { error: "Couldn't save your choice." },
        { status: 502 }
      );
    }
    await recordProductEvent(supabase, user.id, "onboarding_started", {
      intent: body.intent,
      schoolIntent,
    });
    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json({
      ...(row ? statusPayload(row) : {}),
      schoolIntent,
    });
  }

  // ── Create / configure first Space ──────────────────────────────────
  if (action === "create_space") {
    const { row: current } = await readOnboardingRow(supabase, user.id);
    let intent = isOnboardingIntent(body.intent)
      ? body.intent
      : isOnboardingIntent(current?.onboarding_intent)
        ? current!.onboarding_intent
        : null;
    if (!intent) {
      return NextResponse.json(
        { error: "Pick a category first." },
        { status: 400 }
      );
    }
    let schoolIntent: SchoolIntent | null = isSchoolIntent(body.schoolIntent)
      ? body.schoolIntent
      : null;

    const workspaceName =
      typeof body.workspaceName === "string"
        ? body.workspaceName.trim().slice(0, 80) || null
        : null;
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 280) || null
        : null;

    const space = await ensureActivationSpace({
      supabase,
      userId: user.id,
      intent,
      schoolIntent,
      workspaceName,
      description,
    });

    const { error } = await updateProfile(supabase, user.id, {
      onboarding_intent: intent,
      onboarding_skipped: false,
      onboarding_step: "add_knowledge",
      onboarding_completed_at: null,
    });
    if (error) {
      return NextResponse.json(
        { error: "Couldn't save your Space." },
        { status: 502 }
      );
    }

    await recordProductEvent(supabase, user.id, "space_created", {
      intent,
      profileId: space.activeProfileId,
    });
    await recordProductEvent(supabase, user.id, "intent_completed", { intent });

    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json({
      ...(row ? statusPayload(row) : {}),
      activeProfileId: space.activeProfileId,
      createdProfileId: space.createdProfileId,
    });
  }

  // ── First item added ────────────────────────────────────────────────
  if (action === "first_item_added") {
    await updateProfile(supabase, user.id, {
      onboarding_step: "first_value",
    });
    await recordProductEvent(supabase, user.id, "first_item_added", {
      source: typeof body.source === "string" ? body.source : null,
    });
    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json(row ? statusPayload(row) : { step: "first_value" });
  }

  // ── First value reached ─────────────────────────────────────────────
  if (action === "first_value") {
    const now = new Date().toISOString();
    const { row: current } = await readOnboardingRow(supabase, user.id);
    await updateProfile(supabase, user.id, {
      onboarding_step: "ask_gideon",
      first_value_reached_at: current?.first_value_reached_at ?? now,
    });
    await recordProductEvent(supabase, user.id, "first_item_processed");
    await recordProductEvent(supabase, user.id, "first_value_reached");
    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json(row ? statusPayload(row) : { step: "ask_gideon" });
  }

  // ── Complete activation ─────────────────────────────────────────────
  if (action === "complete") {
    const now = new Date().toISOString();
    await updateProfile(supabase, user.id, {
      onboarding_completed_at: now,
      onboarding_skipped: false,
      onboarding_step: "completed",
    });
    await recordProductEvent(supabase, user.id, "coach_completed");
    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json({
      ...(row ? statusPayload(row) : { needsOnboarding: false }),
      activeProfileId: null,
    });
  }

  // ── Legacy coach / intent screen: intent → create + complete ────────
  if (isOnboardingIntent(body.intent)) {
    const intent = body.intent;
    let schoolIntent: SchoolIntent | null = null;
    if (intent === "school") {
      if (!isSchoolIntent(body.schoolIntent)) {
        return NextResponse.json(
          { error: "Choose teacher, student, or parent." },
          { status: 400 }
        );
      }
      schoolIntent = body.schoolIntent;
    }
    const workspaceName =
      typeof body.workspaceName === "string"
        ? body.workspaceName.trim().slice(0, 80) || null
        : null;

    const space = await ensureActivationSpace({
      supabase,
      userId: user.id,
      intent,
      schoolIntent,
      workspaceName,
      description: null,
    });

    const now = new Date().toISOString();
    const { error: updateError } = await updateProfile(supabase, user.id, {
      onboarding_intent: intent,
      onboarding_completed_at: now,
      onboarding_skipped: false,
      onboarding_step: "completed",
    });

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

    await recordProductEvent(supabase, user.id, "intent_completed", { intent });
    await recordProductEvent(supabase, user.id, "space_created", {
      intent,
      profileId: space.activeProfileId,
    });

    const { row } = await readOnboardingRow(supabase, user.id);
    return NextResponse.json({
      ...(row
        ? statusPayload(row)
        : {
            needsOnboarding: false,
            intent,
            completedAt: now,
            skipped: false,
          }),
      activeProfileId: space.activeProfileId,
      createdProfileId: space.createdProfileId,
    });
  }

  return NextResponse.json(
    { error: "Unknown onboarding action." },
    { status: 400 }
  );
}
