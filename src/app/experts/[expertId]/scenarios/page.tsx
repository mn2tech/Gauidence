import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertHeader from "@/components/experts/ExpertHeader";
import ExpertScenario from "@/components/experts/ExpertScenario";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string; scenario?: string }>;
};

export default async function ExpertScenariosPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId, scenario: scenarioId } = await searchParams;
  const { expert, installation } = await loadExpertPageData(expertId, installationId);
  const activeScenarioId = scenarioId ?? expert.scenarios[0]?.id;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl space-y-6 px-6 py-14">
          <ExpertHeader expert={expert} userExpertId={installation.id} currentRoute="scenarios" />
          {activeScenarioId ? (
            <ExpertScenario
              userExpertId={installation.id}
              scenarioId={activeScenarioId}
            />
          ) : (
            <p className="text-sm text-ink-muted">No scenarios are configured for this expert.</p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
