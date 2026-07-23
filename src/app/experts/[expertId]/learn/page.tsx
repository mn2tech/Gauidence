import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertHeader from "@/components/experts/ExpertHeader";
import ExpertLesson from "@/components/experts/ExpertLesson";
import ExpertRoadmap from "@/components/experts/ExpertRoadmap";
import type { ExpertKnowledgeTopic } from "@/lib/experts/expert-schema";
import { getExpertModule } from "@/lib/experts/load-expert";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string; module?: string }>;
};

export default async function ExpertLearnPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId, module: moduleId } = await searchParams;
  const { supabase, expert, installation } = await loadExpertPageData(
    expertId,
    installationId
  );

  const { data: progress } = await supabase
    .from("expert_module_progress")
    .select("*")
    .eq("user_expert_id", installation.id);

  const activeModuleId =
    moduleId ??
    [...expert.roadmap]
      .filter((m) => m.status === "published")
      .sort((a, b) => a.order - b.order)[0]?.id;

  const activeModule = activeModuleId
    ? getExpertModule(expertId, activeModuleId)
    : null;
  const topics = activeModule
    ? expert.knowledgeTopics.filter((topic: ExpertKnowledgeTopic) =>
        activeModule.lessonTopicIds.includes(topic.id)
      )
    : [];
  const moduleProgress = (progress ?? []).find((p) => p.module_id === activeModule?.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl space-y-6 px-6 py-14">
          <ExpertHeader expert={expert} userExpertId={installation.id} currentRoute="learn" />
          <ExpertRoadmap
            expertId={expert.id}
            userExpertId={installation.id}
            modules={expert.roadmap}
            progress={progress ?? []}
          />
          {activeModule ? (
            <ExpertLesson
              userExpertId={installation.id}
              module={activeModule}
              topics={topics}
              progress={moduleProgress}
            />
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
