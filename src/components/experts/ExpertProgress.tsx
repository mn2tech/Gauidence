"use client";

import type { ExpertModuleProgress } from "@/lib/experts/expert-types";
import type { ExpertRoadmapModule } from "@/lib/experts/expert-schema";

type Props = {
  modules: ExpertRoadmapModule[];
  progress: ExpertModuleProgress[];
};

export default function ExpertProgress({ modules, progress }: Props) {
  const published = modules.filter((m) => m.status === "published");
  if (published.length === 0) return null;

  const progressMap = new Map(progress.map((p) => [p.module_id, p]));
  const completed = published.filter(
    (m) => progressMap.get(m.id)?.status === "completed"
  ).length;
  const percent = Math.round((completed / published.length) * 100);

  const current =
    published.find((m) => {
      const status = progressMap.get(m.id)?.status;
      return status === "in_progress" || status === "not_started" || !status;
    }) ?? published[published.length - 1];

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Your progress</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {completed} of {published.length} modules completed
          </p>
        </div>
        <span className="text-2xl font-bold text-brand">{percent}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {current ? (
        <p className="mt-4 text-sm text-ink-muted">
          Current module: <span className="font-medium text-foreground">{current.title}</span>
        </p>
      ) : null}
    </div>
  );
}
