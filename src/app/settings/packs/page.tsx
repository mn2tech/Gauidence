import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  getActiveGuardianProfile,
  listGuardianProfiles,
} from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PacksManager from "@/components/packs/PacksManager";

export const metadata: Metadata = {
  title: "Packs — Guardian",
};

export default async function PacksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ profileId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/packs");

  if (!isGuardianPackEngineEnabled({ email: user.email })) {
    redirect("/settings");
  }

  const [active, allProfiles] = await Promise.all([
    getActiveGuardianProfile(supabase, user),
    listGuardianProfiles(supabase, user.id),
  ]);

  const orgSpaces = allProfiles
    .filter(
      (p) =>
        isOrgStyleProfile(p.profile_type) &&
        (p.access_role === "owner" || p.owner_user_id === user.id)
    )
    .map((p) => ({
      id: p.id,
      displayName: p.display_name,
      profileType: p.profile_type,
    }));

  let profileId = params.profileId?.trim() || "";
  if (profileId && !orgSpaces.some((s) => s.id === profileId)) {
    // Ignore non-org or inaccessible ids from the query string.
    profileId = "";
  }
  if (!profileId && active && isOrgStyleProfile(active.profile_type)) {
    profileId = active.id;
  }
  if (!profileId && orgSpaces[0]) {
    profileId = orgSpaces[0].id;
  }

  const selected =
    orgSpaces.find((s) => s.id === profileId) ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-14">
          <p className="text-sm">
            <a href="/settings" className="text-brand hover:text-brand-dark">
              ← Settings
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Packs</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Install versioned Packs that teach Guardian how to understand your
            organization.
          </p>
          <div className="mt-8">
            <PacksManager
              profileId={selected?.id ?? null}
              profileName={selected?.displayName ?? null}
              orgSpaces={orgSpaces}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
