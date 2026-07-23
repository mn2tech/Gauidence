import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertChat from "@/components/experts/ExpertChat";
import ExpertHeader from "@/components/experts/ExpertHeader";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string; module?: string }>;
};

export default async function ExpertAskPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId, module: moduleId } = await searchParams;
  const { expert, installation } = await loadExpertPageData(expertId, installationId);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl space-y-6 px-6 py-14">
          <ExpertHeader expert={expert} userExpertId={installation.id} currentRoute="ask" />
          <ExpertChat
            userExpertId={installation.id}
            starterQuestions={expert.starterQuestions}
            currentModuleId={moduleId}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
