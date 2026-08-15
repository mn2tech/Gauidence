import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  getActiveGuardianProfile,
  listGuardianProfiles,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";
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

  let profile = null;
  if (query.profileId) {
    profile = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      query.profileId
    );
  }
  if (!profile) {
    profile = await getActiveGuardianProfile(supabase, user);
  }

  if (!profile || !isOrgStyleProfile(profile.profile_type)) {
    const all = await listGuardianProfiles(supabase, user.id);
    const org = all.find(
      (p) =>
        isOrgStyleProfile(p.profile_type) &&
        (p.access_role === "owner" || p.owner_user_id === user.id)
    );
    if (org) {
      const tab = query.tab ? `&tab=${encodeURIComponent(query.tab)}` : "";
      redirect(
        `/settings/packs/${slug}?profileId=${encodeURIComponent(org.id)}${tab}`
      );
    }
    redirect("/settings/packs");
  }

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
