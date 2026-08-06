"use client";

import { useCallback, useEffect, useState } from "react";

type HealthStats = {
  documents: number;
  indexedDocuments: number;
  graphProcessed: number;
  pendingKnowledgeJobs: number;
  failedKnowledgeJobs: number;
  entities: number;
  facts: number;
  relationships: number;
  suggestedFacts: number;
  mergeSuggestions: number;
  notIndexed: number;
  stuckAnalyzing: number;
  uploadedNotAnalyzed: { id: string; file_name: string }[];
  failedAnalysis: { id: string; file_name: string }[];
};

type ReviewFact = {
  id: string;
  subject_name: string;
  predicate: string;
  object_value: string | null;
  unit: string | null;
  confidence: number;
  review_status: string;
  sourceFileName: string | null;
  source_excerpt: string | null;
  profile_id: string;
};

export default function KnowledgeEnginePanel() {
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [facts, setFacts] = useState<ReviewFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, reviewRes] = await Promise.all([
        fetch("/api/knowledge/health"),
        fetch("/api/knowledge/review?status=suggested"),
      ]);
      if (!healthRes.ok) throw new Error("Failed to load health stats");
      if (!reviewRes.ok) throw new Error("Failed to load review data");
      setHealth(await healthRes.json());
      const review = await reviewRes.json();
      setFacts(review.facts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateFact(factId: string, action: "confirm" | "reject") {
    await fetch("/api/knowledge/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factId, action }),
    });
    void load();
  }

  async function retryAnalysis(mode: "failed" | "uploaded" | "stuck" | "all") {
    await fetch("/api/documents/retry-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    void load();
  }

  if (loading && !health) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted">
        Loading knowledge engine…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Knowledge Health</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Structured facts extracted from your vault documents.
        </p>
        {health ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Documents" value={health.documents} />
            <Stat label="Indexed" value={health.indexedDocuments} />
            <Stat label="Graph processed" value={health.graphProcessed} />
            <Stat label="Entities" value={health.entities} />
            <Stat label="Facts" value={health.facts} />
            <Stat label="Relationships" value={health.relationships} />
            <Stat label="Pending jobs" value={health.pendingKnowledgeJobs} />
            <Stat label="Failed jobs" value={health.failedKnowledgeJobs} />
            <Stat label="Suggested facts" value={health.suggestedFacts} />
            <Stat label="Not indexed" value={health.notIndexed} />
            <Stat label="Stuck analyzing" value={health.stuckAnalyzing} />
            <Stat label="Merge suggestions" value={health.mergeSuggestions} />
          </dl>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void retryAnalysis("failed")}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium hover:bg-stone-200"
          >
            Retry Failed
          </button>
          <button
            type="button"
            onClick={() => void retryAnalysis("uploaded")}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium hover:bg-stone-200"
          >
            Retry Uploaded
          </button>
          <button
            type="button"
            onClick={() => void retryAnalysis("stuck")}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium hover:bg-stone-200"
          >
            Retry Stuck
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Suggested Facts</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Review and confirm extracted knowledge before Gideon treats it as verified.
        </p>
        {facts.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No suggested facts awaiting review.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm"
              >
                <p className="font-medium">
                  {fact.subject_name} → {fact.predicate} →{" "}
                  {fact.object_value}
                  {fact.unit ? ` / ${fact.unit}` : ""}
                </p>
                <p className="mt-1 text-ink-muted">
                  Source: {fact.sourceFileName ?? "unknown"} · confidence{" "}
                  {fact.confidence.toFixed(2)}
                </p>
                {fact.source_excerpt ? (
                  <p className="mt-1 italic text-ink-muted">
                    &ldquo;{fact.source_excerpt.slice(0, 160)}&rdquo;
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void updateFact(fact.id, "confirm")}
                    className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateFact(fact.id, "reject")}
                    className="rounded-lg bg-stone-200 px-3 py-1 text-xs font-medium"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
