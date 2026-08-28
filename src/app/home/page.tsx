import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import SimpleHomeScreen from "@/components/simple-home/SimpleHomeScreen";

export const metadata: Metadata = {
  title: "Guardian Today — Guardian",
  description: "What needs your attention today across all your Spaces.",
};

export default async function SimpleHomePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/ask");
  }

  const active = await getActiveGuardianProfile(supabase, user);
  if (isEmployeeHubProfile(active)) {
    redirect("/employee");
  }

  return (
    <SimpleAppShell>
      <SimpleHomeScreen />
    </SimpleAppShell>
  );
}
