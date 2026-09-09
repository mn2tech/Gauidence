import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import WorldEntityScreen from "@/components/world/WorldEntityScreen";

export const metadata: Metadata = {
  title: "Details — My World — Guardian",
  description: "What Guardian knows about someone or something in your world.",
};

export default async function WorldEntityPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/settings/profiles");
  }

  const active = await getActiveGuardianProfile(supabase, user);
  if (isEmployeeHubProfile(active)) {
    redirect("/employee");
  }

  const { entityId } = await params;

  return (
    <SimpleAppShell>
      <Suspense
        fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}
      >
        <WorldEntityScreen entityId={entityId} />
      </Suspense>
    </SimpleAppShell>
  );
}
