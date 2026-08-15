import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import { getInstalledPack } from "@/lib/packs/catalog";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PackDashboardPanel from "@/components/packs/PackDashboardPanel";

export const metadata: Metadata = {
  title: "Business Dashboard — Guardian",
};

export default async function PackDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ profileId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/packs/${slug}/dashboard`);

  if (!isGuardianPackEngineEnabled({ email: user.email })) {
    redirect("/settings");
  }

  let profile = await getActiveGuardianProfile(supabase, user);
  if (query.profileId) {
    const accessible = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      query.profileId
    );
    if (accessible) profile = accessible;
  }
  if (!profile) redirect("/settings/profiles");

  const installed = await getInstalledPack(supabase, profile.id, slug);
  if (!installed) {
    redirect(
      `/settings/packs/${slug}?profileId=${encodeURIComponent(profile.id)}&tab=install`
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <p className="text-sm">
            <a
              href={`/settings/packs/${slug}?profileId=${encodeURIComponent(profile.id)}`}
              className="text-brand hover:text-brand-dark"
            >
              ← {installed.definition.pack.name}
            </a>
          </p>
          <div className="mt-6">
            <PackDashboardPanel
              slug={slug}
              profileId={profile.id}
              profileName={profile.display_name}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
