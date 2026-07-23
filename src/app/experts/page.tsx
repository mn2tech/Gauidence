import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertCatalog from "@/components/experts/ExpertCatalog";
import { getExpertCatalog } from "@/lib/experts/load-expert";
import { listUserExpertsForUser } from "@/lib/experts/server";
import { requireExpertsPageAccess } from "@/lib/experts/page-helpers";

export const metadata: Metadata = {
  title: "Guardian Experts",
  description: "Install reusable learning and guidance experts inside Guardian.",
};

type PageProps = {
  searchParams: Promise<{ install?: string }>;
};

export default async function ExpertsPage({ searchParams }: PageProps) {
  const { supabase, user } = await requireExpertsPageAccess();
  const experts = getExpertCatalog().map(
    ({ validationError: _validationError, effectiveStatus, ...item }) => ({
      ...item,
      effectiveStatus,
    })
  );
  const installations = await listUserExpertsForUser(supabase, user.id);
  const params = await searchParams;

  if (params.install) {
    const existing = installations.find((i) => i.expert_id === params.install);
    if (existing) redirect(`/experts/${params.install}?installation=${existing.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight">Guardian Experts</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Install reusable experts for structured learning, practice, and guided Q&amp;A.
            Each expert is defined by versioned JSON and keeps your progress in Guardian.
          </p>
          <div className="mt-8">
            <ExpertCatalog
              initialExperts={experts}
              initialInstallations={installations}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
