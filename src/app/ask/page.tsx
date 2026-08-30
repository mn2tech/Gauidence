import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { getEmployeeHubEntitlements } from "@/lib/employee-hub/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SiteHeader from "@/components/SiteHeader";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import VaultChatPanel from "@/components/VaultChatPanelLazy";

export const metadata: Metadata = {
  title: "Ask Gideon — Guardian",
  description:
    "Ask Gideon — your AI Chief of Staff. Plan your day, think through decisions, or search Guardian when you need your files.",
};

export default async function AskGideonPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await getActiveGuardianProfile(supabase, user);
  if (isEmployeeHubProfile(active)) {
    const entitlements = await getEmployeeHubEntitlements(supabase, active.id);
    if (entitlements && !entitlements.gideon_chat) {
      redirect("/employee");
    }
  }

  const chat = (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-ink-muted">Loading Ask Gideon…</p>
      }
    >
      <VaultChatPanel variant="page" />
    </Suspense>
  );

  if (
    canAccessSimpleHome({ email: user.email }) &&
    !isEmployeeHubProfile(active)
  ) {
    return <SimpleAppShell layout="chat">{chat}</SimpleAppShell>;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader />
      <div className="min-h-0 flex-1">{chat}</div>
    </div>
  );
}
