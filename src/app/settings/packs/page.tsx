import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
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

  const active = await getActiveGuardianProfile(supabase, user);
  let profileId = active?.id;
  let profileName = active?.display_name ?? "Space";

  if (params.profileId) {
    const { data } = await supabase
      .from("guardian_profiles")
      .select("id, display_name")
      .eq("id", params.profileId)
      .maybeSingle();
    if (data) {
      profileId = data.id;
      profileName = data.display_name ?? profileName;
    }
  }

  if (!profileId) redirect("/settings/profiles");

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
            <PacksManager profileId={profileId} profileName={profileName} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
