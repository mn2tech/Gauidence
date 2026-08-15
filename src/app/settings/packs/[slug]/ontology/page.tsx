import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import { getInstalledPack } from "@/lib/packs/catalog";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OntologyExplorerPanel from "@/components/admin/OntologyExplorerPanel";

export const metadata: Metadata = {
  title: "Ontology Explorer — Guardian Pack",
};

export default async function PackOntologyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ profileId?: string; entityId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/packs/${slug}/ontology`);

  if (!isGuardianPackEngineEnabled({ email: user.email })) {
    redirect("/settings");
  }
  if (!isGuardianOntologyEnabled()) {
    redirect(`/settings/packs/${slug}`);
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
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Ontology Explorer
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Search entities, inspect relationships, and open evidence from
            Guardian sources. No fabricated graph — only what was extracted with
            provenance.
          </p>
          <div className="mt-8">
            <OntologyExplorerPanel
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
