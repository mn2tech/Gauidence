import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianExperts } from "@/lib/features/experts";
import { getExpertPublicById } from "@/lib/experts/load-expert";
import {
  listUserExpertsByExpertId,
  requireOwnedUserExpert,
} from "@/lib/experts/server";

export async function requireExpertsPageAccess() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessGuardianExperts({ email: user.email })) {
    redirect("/ask");
  }

  return { supabase, user };
}

export async function resolveExpertInstallation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  expertId: string,
  installationId?: string | null
) {
  if (!supabase) return null;

  if (installationId) {
    const owned = await requireOwnedUserExpert(supabase, userId, installationId);
    if (owned && owned.expert_id === expertId) return owned;
  }

  const installations = await listUserExpertsByExpertId(supabase, userId, expertId);
  return installations[0] ?? null;
}

export async function loadExpertPageData(
  expertId: string,
  installationId?: string | null
) {
  const { supabase, user } = await requireExpertsPageAccess();
  const expert = getExpertPublicById(expertId);
  if (!expert) redirect("/experts");

  const installation = await resolveExpertInstallation(
    supabase,
    user.id,
    expertId,
    installationId
  );
  if (!installation) redirect(`/experts?install=${expertId}`);

  return { supabase, user, expert, installation };
}
