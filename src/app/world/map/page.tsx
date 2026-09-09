import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Map } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import { WORLD_PATH } from "@/lib/routes";

export const metadata: Metadata = {
  title: "World Map — Guardian",
  description: "A simple map of the important parts of your world.",
};

/** Sprint 3 builds the interactive map; Sprint 2 ships a clear placeholder. */
export default async function WorldMapPage() {
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
      <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
        <Link
          href={WORLD_PATH}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My World
        </Link>
        <div className="simple-home-card space-y-3 p-8 text-center">
          <Map className="mx-auto h-8 w-8 text-brand" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">World Map</h1>
          <p className="text-sm text-ink-muted">
            A simple map of you at the center, with people and organizations
            around you, is coming next. For now, browse Overview and open anyone
            Guardian knows about.
          </p>
          <Link
            href={WORLD_PATH}
            className="inline-flex rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Back to Overview
          </Link>
        </div>
      </div>
    </SimpleAppShell>
  );
}
