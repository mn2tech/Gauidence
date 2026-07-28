"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ExpertModuleProgress, ExpertPublicView } from "@/lib/experts/expert-types";
import ExpertHeader from "./ExpertHeader";
import ExpertLesson from "./ExpertLesson";
import ExpertRoadmap from "./ExpertRoadmap";

type Props = {
  expert: ExpertPublicView;
  userExpertId: string;
  progress: ExpertModuleProgress[];
};

function publishedModules(expert: ExpertPublicView) {
  return [...expert.roadmap]
    .filter((m) => m.status === "published")
    .sort((a, b) => a.order - b.order);
}

export default function ExpertLearnContent({
  expert,
  userExpertId,
  progress,
}: Props) {
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module");
  const published = useMemo(() => publishedModules(expert), [expert]);

  const activeModuleId =
    moduleParam && published.some((m) => m.id === moduleParam)
      ? moduleParam
      : published[0]?.id;

  const activeModule = published.find((m) => m.id === activeModuleId) ?? null;
  const topics = activeModule
    ? expert.knowledgeTopics.filter((t) =>
        activeModule.lessonTopicIds.includes(t.id)
      )
    : [];
  const moduleProgress = progress.find((p) => p.module_id === activeModule?.id);

  useEffect(() => {
    if (!activeModule) return;
    const shouldScroll =
      Boolean(moduleParam) || window.location.hash === "#expert-lessons";
    if (!shouldScroll) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("expert-lessons")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeModule, moduleParam]);

  return (
    <>
      <ExpertHeader expert={expert} userExpertId={userExpertId} currentRoute="learn" />
      <ExpertRoadmap
        expertId={expert.id}
        userExpertId={userExpertId}
        modules={expert.roadmap}
        progress={progress}
        activeModuleId={activeModuleId}
        scrollToLessons
      />
      {activeModule ? (
        <div id="expert-lessons">
          <ExpertLesson
            userExpertId={userExpertId}
            module={activeModule}
            topics={topics}
            progress={moduleProgress}
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-200 p-6 text-sm text-ink-muted">
          No learning modules are available for this expert yet.
        </p>
      )}
    </>
  );
}
