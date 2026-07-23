import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertHeader from "@/components/experts/ExpertHeader";
import ExpertQuiz from "@/components/experts/ExpertQuiz";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string; quiz?: string }>;
};

export default async function ExpertQuizPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId, quiz: quizId } = await searchParams;
  const { expert, installation } = await loadExpertPageData(expertId, installationId);
  const activeQuizId = quizId ?? expert.quizzes[0]?.id;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl space-y-6 px-6 py-14">
          <ExpertHeader expert={expert} userExpertId={installation.id} currentRoute="quiz" />
          {activeQuizId ? (
            <ExpertQuiz userExpertId={installation.id} quizId={activeQuizId} />
          ) : (
            <p className="text-sm text-ink-muted">No quizzes are configured for this expert.</p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
