import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import MyWorldScreen from "@/components/world/MyWorldScreen";

export const metadata: Metadata = {
  title: "My World — Guardian",
  description: "The important parts of your life and work Guardian knows about.",
};

export default async function WorldPage() {
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
        fallback={<p className="p-6 text-sm text-ink-muted">Loading My World…</p>}
      >
        <MyWorldScreen />
      </Suspense>
    </SimpleAppShell>
  );
}
