import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertHeader from "@/components/experts/ExpertHeader";
import ExpertInterview from "@/components/experts/ExpertInterview";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string }>;
};

export default async function ExpertInterviewPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId } = await searchParams;
  const { expert, installation } = await loadExpertPageData(expertId, installationId);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl space-y-6 px-6 py-14">
          <ExpertHeader expert={expert} userExpertId={installation.id} currentRoute="interview" />
          <ExpertInterview userExpertId={installation.id} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
