"use client";

import type { ExpertPublicView } from "@/lib/experts/expert-types";
import type { ExpertActivity, ExpertModuleProgress } from "@/lib/experts/expert-types";
import ExpertActivityPanel from "./ExpertActivity";
import ExpertCapabilities from "./ExpertCapabilities";
import ExpertHeader from "./ExpertHeader";
import ExpertProgress from "./ExpertProgress";
import ExpertRoadmap from "./ExpertRoadmap";

type Props = {
  expert: ExpertPublicView;
  userExpertId: string;
  progress: ExpertModuleProgress[];
  activity: ExpertActivity[];
};

export default function ExpertDashboard({
  expert,
  userExpertId,
  progress,
  activity,
}: Props) {
  return (
    <div className="space-y-6">
      <ExpertHeader expert={expert} userExpertId={userExpertId} currentRoute="dashboard" />

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">Primary goal</h2>
        <p className="mt-2 text-sm text-ink-muted">{expert.primaryGoal}</p>
      </div>

      <ExpertProgress modules={expert.roadmap} progress={progress} />
      <ExpertCapabilities
        expertId={expert.id}
        userExpertId={userExpertId}
        capabilities={expert.capabilities}
      />

      {expert.starterQuestions.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold">Starter questions</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {expert.starterQuestions.map((question: string) => (
              <li key={question} className="rounded-lg bg-stone-50 px-3 py-2">
                {question}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ExpertRoadmap
        expertId={expert.id}
        userExpertId={userExpertId}
        modules={expert.roadmap}
        progress={progress}
        compact
      />
      <ExpertActivityPanel activity={activity} />
    </div>
  );
}
