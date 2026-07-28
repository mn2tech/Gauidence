import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertLearnContent from "@/components/experts/ExpertLearnContent";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string; module?: string }>;
};

export default async function ExpertLearnPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId } = await searchParams;
  const { supabase, expert, installation } = await loadExpertPageData(
    expertId,
    installationId
  );

  const { data: progress } = await supabase
    .from("expert_module_progress")
    .select("*")
    .eq("user_expert_id", installation.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl space-y-6 px-6 py-14">
          <Suspense
            fallback={
              <p className="text-sm text-ink-muted">Loading lessons…</p>
            }
          >
            <ExpertLearnContent
              expert={expert}
              userExpertId={installation.id}
              progress={progress ?? []}
            />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
