import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpertAssignedEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { grantExpertEntitlement } from "@/lib/experts/entitlements";
import { getExpertCatalog } from "@/lib/experts/load-expert";
import { isExpertInstallable } from "@/lib/experts/expert-types";
import type { UserExpert } from "@/lib/experts/expert-types";
import { USER_EXPERT_SELECT } from "@/lib/experts/server";

export type AssignExpertResult =
  | {
      ok: true;
      installation?: UserExpert;
      grantOnly: boolean;
      created: boolean;
      entitled: boolean;
      emailed: boolean;
    }
  | { ok: false; status: number; error: string; userExpertId?: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateAssignableExpert(expertId: string) {
  const catalogItem = getExpertCatalog().find((e) => e.id === expertId);
  if (!catalogItem || catalogItem.effectiveStatus === "unavailable") {
    return { ok: false as const, status: 404, error: "Expert not found." };
  }

  if (
    catalogItem.effectiveStatus === "coming-soon" ||
    catalogItem.effectiveStatus === "archived" ||
    !isExpertInstallable(catalogItem.status)
  ) {
    return {
      ok: false as const,
      status: 403,
      error: "This expert is not available for assignment.",
    };
  }

  return { ok: true as const, catalogItem };
}

export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();

  if (error) {
    console.error("findUserIdByEmail:", error.message);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

export async function resolveTargetProfileId(
  admin: SupabaseClient,
  userId: string,
  profileId?: string | null
): Promise<string | null> {
  if (profileId?.trim()) {
    const id = profileId.trim();
    const { data: member } = await admin
      .from("guardian_profile_members")
      .select("profile_id")
      .eq("profile_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (member?.profile_id) return member.profile_id as string;

    const { data: owned } = await admin
      .from("guardian_profiles")
      .select("id")
      .eq("id", id)
      .eq("owner_user_id", userId)
      .maybeSingle();

    return (owned?.id as string | undefined) ?? null;
  }

  const { data: defaultProfile } = await admin
    .from("guardian_profiles")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (defaultProfile?.id) return defaultProfile.id as string;

  const { data: anyProfile } = await admin
    .from("guardian_profiles")
    .select("id")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (anyProfile?.id as string | undefined) ?? null;
}

export async function assignExpertToUser(params: {
  admin: SupabaseClient;
  targetUserId: string;
  expertId: string;
  profileId?: string | null;
  assignedByUserId?: string | null;
}): Promise<AssignExpertResult> {
  const validation = validateAssignableExpert(params.expertId);
  if (!validation.ok) return validation;
  const { catalogItem } = validation;

  const resolvedProfileId = await resolveTargetProfileId(
    params.admin,
    params.targetUserId,
    params.profileId
  );
  if (!resolvedProfileId) {
    return {
      ok: false,
      status: 404,
      error: "No accessible profile found for this user.",
    };
  }

  const entitled = await grantExpertEntitlement(params.admin, {
    userId: params.targetUserId,
    expertId: params.expertId,
    grantedBy: params.assignedByUserId,
  });
  if (!entitled) {
    return { ok: false, status: 502, error: "Couldn't grant expert access." };
  }

  const { data: existing } = await params.admin
    .from("user_experts")
    .select(USER_EXPERT_SELECT)
    .eq("user_id", params.targetUserId)
    .eq("profile_id", resolvedProfileId)
    .eq("expert_id", params.expertId)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      installation: existing as UserExpert,
      grantOnly: false,
      created: false,
      entitled: true,
      emailed: false,
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await params.admin
    .from("user_experts")
    .insert({
      user_id: params.targetUserId,
      profile_id: resolvedProfileId,
      expert_id: params.expertId,
      expert_version: catalogItem.version,
      status: "active",
      installed_at: now,
      last_opened_at: now,
      updated_at: now,
      preferences: params.assignedByUserId
        ? { assignedBy: params.assignedByUserId, assignedAt: now }
        : {},
    })
    .select(USER_EXPERT_SELECT)
    .single();

  if (error || !data) {
    console.error("assignExpertToUser:", error?.message ?? "insert failed");
    return { ok: false, status: 502, error: "Couldn't assign expert." };
  }

  const { error: activityError } = await params.admin.from("expert_activity").insert({
    user_id: params.targetUserId,
    user_expert_id: data.id,
    activity_type: "expert_installed",
    content_id: params.expertId,
    metadata: params.assignedByUserId
      ? { assignedBy: params.assignedByUserId, assigned: true }
      : { assigned: true },
  });

  if (activityError) {
    console.error("assignExpertToUser activity:", activityError.message);
  }

  return {
    ok: true,
    installation: data as UserExpert,
    grantOnly: false,
    created: true,
    entitled: true,
    emailed: false,
  };
}

async function resolveAssignerName(
  admin: SupabaseClient,
  assignedByUserId?: string | null
): Promise<string> {
  if (!assignedByUserId) return "Guardian";

  const { data } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", assignedByUserId)
    .maybeSingle();

  const fullName = (data?.full_name as string | null)?.trim();
  if (fullName) return fullName;
  const email = (data?.email as string | null)?.trim();
  if (email) return email;
  return "Guardian";
}

async function sendAssignNotification(params: {
  targetEmail: string;
  expertId: string;
  assignerName: string;
  grantOnly: boolean;
  installationId?: string;
}): Promise<boolean> {
  const catalogItem = getExpertCatalog().find((e) => e.id === params.expertId);
  const openUrl = params.grantOnly
    ? `${appBaseUrl()}/experts`
    : `${appBaseUrl()}/experts/${params.expertId}?installation=${params.installationId}`;

  return sendExpertAssignedEmail({
    to: normalizeEmail(params.targetEmail),
    expertName: catalogItem?.name ?? params.expertId,
    expertDescription:
      catalogItem?.description ??
      "A Guardian Expert has been added to your account.",
    assignerName: params.assignerName,
    openUrl,
    grantOnly: params.grantOnly,
  });
}

export async function grantExpertAccessByEmail(params: {
  admin: SupabaseClient;
  targetEmail: string;
  expertId: string;
  assignedByUserId?: string | null;
}): Promise<AssignExpertResult> {
  const validation = validateAssignableExpert(params.expertId);
  if (!validation.ok) return validation;

  const userId = await findUserIdByEmail(params.admin, params.targetEmail);
  if (!userId) {
    return {
      ok: false,
      status: 404,
      error: "No Guardian account found for that email.",
    };
  }

  const entitled = await grantExpertEntitlement(params.admin, {
    userId,
    expertId: params.expertId,
    grantedBy: params.assignedByUserId,
  });
  if (!entitled) {
    return { ok: false, status: 502, error: "Couldn't grant expert access." };
  }

  const assignerName = await resolveAssignerName(
    params.admin,
    params.assignedByUserId
  );
  const emailed = await sendAssignNotification({
    targetEmail: params.targetEmail,
    expertId: params.expertId,
    assignerName,
    grantOnly: true,
  });

  return {
    ok: true,
    grantOnly: true,
    created: true,
    entitled: true,
    emailed,
  };
}

export async function assignExpertByEmail(params: {
  admin: SupabaseClient;
  targetEmail: string;
  expertId: string;
  profileId?: string | null;
  assignedByUserId?: string | null;
  grantOnly?: boolean;
}): Promise<AssignExpertResult> {
  if (params.grantOnly) {
    return grantExpertAccessByEmail({
      admin: params.admin,
      targetEmail: params.targetEmail,
      expertId: params.expertId,
      assignedByUserId: params.assignedByUserId,
    });
  }

  const userId = await findUserIdByEmail(params.admin, params.targetEmail);
  if (!userId) {
    return {
      ok: false,
      status: 404,
      error: "No Guardian account found for that email.",
    };
  }

  const result = await assignExpertToUser({
    admin: params.admin,
    targetUserId: userId,
    expertId: params.expertId,
    profileId: params.profileId,
    assignedByUserId: params.assignedByUserId,
  });

  if (!result.ok) return result;

  if (!result.created) {
    return result;
  }

  const assignerName = await resolveAssignerName(
    params.admin,
    params.assignedByUserId
  );
  const emailed = await sendAssignNotification({
    targetEmail: params.targetEmail,
    expertId: params.expertId,
    assignerName,
    grantOnly: false,
    installationId: result.installation?.id,
  });

  return { ...result, emailed };
}
