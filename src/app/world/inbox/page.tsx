import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import WorldInboxScreen from "@/components/world/WorldInboxScreen";

export const metadata: Metadata = {
  title: "Confirmations — My World — Guardian",
  description: "Confirm, edit, or reject what Guardian thinks it knows.",
};

export default async function WorldInboxPage() {
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

  return (
    <SimpleAppShell>
      <Suspense
        fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}
      >
        <WorldInboxScreen />
      </Suspense>
    </SimpleAppShell>
  );
}
