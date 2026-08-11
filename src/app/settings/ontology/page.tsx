import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OntologyExplorerPanel from "@/components/admin/OntologyExplorerPanel";

export const metadata: Metadata = {
  title: "Ontology Explorer — Guardian",
};

export default async function OntologySettingsPage() {
  if (!isGuardianOntologyEnabled()) {
    redirect("/settings");
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/ontology");
  if (!isPlatformAdmin(user.email)) redirect("/settings");

  const profile = await getActiveGuardianProfile(supabase, user.id);
  if (!profile) redirect("/settings/profiles");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <p className="text-sm">
            <a href="/settings" className="text-brand hover:text-brand-dark">
              ← Settings
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Guardian Ontology
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Explore entities, relationships, and evidence extracted from your
            documents. Admin-only.
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
