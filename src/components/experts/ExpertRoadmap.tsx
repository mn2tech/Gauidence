"use client";

import Link from "next/link";
import type { ExpertRoadmapModule } from "@/lib/experts/expert-schema";
import type { ExpertModuleProgress } from "@/lib/experts/expert-types";

type Props = {
  expertId: string;
  userExpertId: string;
  modules: ExpertRoadmapModule[];
  progress: ExpertModuleProgress[];
  compact?: boolean;
  activeModuleId?: string;
};

function moduleHref(expertId: string, userExpertId: string, moduleId: string) {
  return `/experts/${expertId}/learn?installation=${encodeURIComponent(userExpertId)}&module=${encodeURIComponent(moduleId)}`;
}

function statusLabel(status?: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    case "skipped":
      return "Skipped";
    default:
      return "Not started";
  }
}

export default function ExpertRoadmap({
  expertId,
  userExpertId,
  modules,
  progress,
  compact = false,
  activeModuleId,
}: Props) {
  const published = [...modules]
    .filter((m) => m.status === "published")
    .sort((a, b) => a.order - b.order);
  const progressMap = new Map(progress.map((p) => [p.module_id, p]));

  if (published.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Roadmap</h2>
        {compact ? (
          <Link
            href={moduleHref(expertId, userExpertId, published[0]!.id)}
            className="text-sm font-medium text-brand hover:underline"
          >
            Open learning
          </Link>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {published.map((module) => {
          const moduleProgress = progressMap.get(module.id);
          const isActive = activeModuleId === module.id;
          return (
            <Link
              key={module.id}
              href={moduleHref(expertId, userExpertId, module.id)}
              className={`block rounded-xl border p-4 transition hover:border-brand/40 hover:bg-brand-light/10 ${
                isActive
                  ? "border-brand/50 bg-brand-light/20"
                  : "border-stone-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Module {module.order}
                  </p>
                  <p className="font-medium">{module.title}</p>
                </div>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {statusLabel(moduleProgress?.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{module.description}</p>
              {!compact ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
                  {module.estimatedMinutes ? (
                    <span>{module.estimatedMinutes} min</span>
                  ) : null}
                  <span>{module.learningObjectives.length} objectives</span>
                  <span>{module.lessonTopicIds.length} lessons</span>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
