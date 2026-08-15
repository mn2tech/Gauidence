import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PackDetailPanel from "@/components/packs/PackDetailPanel";

export const metadata: Metadata = {
  title: "Pack — Guardian",
};

export default async function PackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ profileId?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/packs/${slug}`);

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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-14">
          <p className="text-sm">
            <a
              href={`/settings/packs?profileId=${encodeURIComponent(profile.id)}`}
              className="text-brand hover:text-brand-dark"
            >
              ← Packs
            </a>
          </p>
          <div className="mt-6">
            <PackDetailPanel
              slug={slug}
              profileId={profile.id}
              profileName={profile.display_name}
              initialTab={query.tab}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
