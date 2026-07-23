"use client";

import { useState } from "react";
import type { ExpertKnowledgeTopic } from "@/lib/experts/expert-schema";
import type { ExpertRoadmapModule } from "@/lib/experts/expert-schema";
import type { ExpertModuleProgress } from "@/lib/experts/expert-types";

type Props = {
  userExpertId: string;
  module: ExpertRoadmapModule;
  topics: ExpertKnowledgeTopic[];
  progress?: ExpertModuleProgress;
};

export default function ExpertLesson({
  userExpertId,
  module,
  topics,
  progress,
}: Props) {
  const [activeTopicId, setActiveTopicId] = useState(topics[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? topics[0];

  async function updateProgress(status: "in_progress" | "completed") {
    setSaving(true);
    try {
      await fetch(`/api/experts/${userExpertId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: module.id,
          status,
          progressPercent: status === "completed" ? 100 : 50,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!activeTopic) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 p-6 text-sm text-ink-muted">
        No lesson topics are configured for this module.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Module {module.order}
        </p>
        <h2 className="text-xl font-semibold">{module.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{module.description}</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          {module.learningObjectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void updateProgress("in_progress")}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium"
          >
            Mark in progress
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void updateProgress("completed")}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Mark completed
          </button>
          {progress ? (
            <span className="self-center text-sm text-ink-muted">
              Status: {progress.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-2">
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => setActiveTopicId(topic.id)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                topic.id === activeTopic.id
                  ? "bg-brand text-white"
                  : "border border-stone-200 bg-white text-ink-muted"
              }`}
            >
              {topic.title}
            </button>
          ))}
        </aside>

        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <h3 className="text-lg font-semibold">{activeTopic.title}</h3>
          <p className="mt-2 text-sm text-ink-muted">{activeTopic.summary}</p>
          {activeTopic.details.length > 0 ? (
            <div className="mt-5 space-y-2 text-sm text-ink-muted">
              {activeTopic.details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </div>
          ) : null}
          {activeTopic.keyPoints.length > 0 ? (
            <div className="mt-5">
              <h4 className="font-medium">Key points</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {activeTopic.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {activeTopic.examples.length > 0 ? (
            <div className="mt-5 space-y-3">
              <h4 className="font-medium">Examples</h4>
              {activeTopic.examples.map((example) => (
                <div key={example.title} className="rounded-xl bg-stone-50 p-4 text-sm">
                  <p className="font-medium">{example.title}</p>
                  <p className="mt-1 text-ink-muted">{example.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
