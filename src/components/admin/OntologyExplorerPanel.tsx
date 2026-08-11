"use client";

import { useCallback, useEffect, useState } from "react";
import type { EntityGraph } from "@/lib/ontology/types";
import OntologyGraphMap from "@/components/admin/OntologyGraphMap";
import OntologySpaceMap, {
  type SpaceGraphData,
} from "@/components/admin/OntologySpaceMap";

type OntologyEntity = {
  id: string;
  entity_type: string;
  name: string;
  canonical_name: string | null;
  description: string | null;
  confidence: number | null;
  review_status?: string | null;
  source_type: string | null;
  updated_at: string;
};

type SpaceStats = {
  entityCount: number;
  relationshipCount: number;
  evidenceCount: number;
  needsReview: number;
};

type ReviewItem =
  | {
      kind: "entity";
      item: OntologyEntity;
    }
  | {
      kind: "relationship";
      item: {
        id: string;
        relationship_type: string;
        confidence: number | null;
        source_entity_id: string;
        target_entity_id: string;
      };
      sourceName?: string;
      targetName?: string;
    };

type Tab = "entities" | "space" | "review";

type Props = {
  profileId: string;
  profileName: string;
};

export default function OntologyExplorerPanel({ profileId, profileName }: Props) {
  const [tab, setTab] = useState<Tab>("entities");
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<OntologyEntity[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [spaceGraph, setSpaceGraph] = useState<SpaceGraphData | null>(null);
  const [includeMentions, setIncludeMentions] = useState(false);
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ profileId, q: query });
      const [searchRes, statsRes] = await Promise.all([
        fetch(`/api/ontology/search?${params}`),
        fetch(`/api/ontology/stats?profileId=${profileId}`),
      ]);
      if (!searchRes.ok) throw new Error("Failed to load entities");
      if (!statsRes.ok) throw new Error("Failed to load stats");
      const searchData = await searchRes.json();
      setEntities(searchData.entities ?? []);
      setStats(await statsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [profileId, query]);

  const loadReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewRes, statsRes] = await Promise.all([
        fetch(`/api/ontology/review?profileId=${profileId}`),
        fetch(`/api/ontology/stats?profileId=${profileId}`),
      ]);
      if (!reviewRes.ok) throw new Error("Failed to load review queue");
      if (!statsRes.ok) throw new Error("Failed to load stats");
      const reviewData = await reviewRes.json();
      setReviewItems(reviewData.items ?? []);
      setStats(await statsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  const loadSpaceGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ profileId });
      if (includeMentions) params.set("includeMentions", "1");
      const [graphRes, statsRes] = await Promise.all([
        fetch(`/api/ontology/graph?${params}`),
        fetch(`/api/ontology/stats?profileId=${profileId}`),
      ]);
      if (!graphRes.ok) throw new Error("Failed to load space map");
      if (!statsRes.ok) throw new Error("Failed to load stats");
      setSpaceGraph(await graphRes.json());
      setStats(await statsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [profileId, includeMentions]);

  const loadGraph = useCallback(async (entityId: string) => {
    setSelectedId(entityId);
    setGraph(null);
    try {
      const res = await fetch(`/api/ontology/entities/${entityId}`);
      if (!res.ok) throw new Error("Failed to load entity");
      setGraph(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entity");
    }
  }, []);

  useEffect(() => {
    if (tab === "entities") void loadEntities();
    else if (tab === "space") void loadSpaceGraph();
    else void loadReview();
  }, [tab, loadEntities, loadSpaceGraph, loadReview]);

  function openEntityFromMap(entityId: string) {
    setTab("entities");
    void loadGraph(entityId);
  }
  async function runBackfill(limit: number) {
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/ontology/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: profileId, limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backfill failed");
      setBackfillResult(
        `Processed ${data.processed}: ${data.successful} ok, ${data.failed} failed, ${data.skipped} skipped`
      );
      void loadEntities();
    } catch (err) {
      setBackfillResult(err instanceof Error ? err.message : "Backfill failed");
    }
  }

  async function reviewAction(
    kind: "entity" | "relationship",
    id: string,
    status: "confirmed" | "rejected"
  ) {
    setError(null);
    try {
      const res = await fetch("/api/ontology/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, kind, id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review update failed");
      void loadReview();
      if (selectedId === id && kind === "entity") {
        void loadGraph(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review update failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="text-sm text-ink-muted">
          Space: <span className="font-medium text-ink">{profileName}</span>
        </p>
        {stats ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Entities" value={stats.entityCount} />
            <Stat label="Relationships" value={stats.relationshipCount} />
            <Stat label="Evidence" value={stats.evidenceCount} />
            <Stat label="Needs review" value={stats.needsReview} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "entities"} onClick={() => setTab("entities")}>
          Entities
        </TabButton>
        <TabButton active={tab === "space"} onClick={() => setTab("space")}>
          Space map
        </TabButton>
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>
          Needs review
          {stats && stats.needsReview > 0 ? ` (${stats.needsReview})` : ""}
        </TabButton>
      </div>

      {tab === "entities" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <label className="block text-sm font-medium">Search entities</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, alias, or description…"
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === "space" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Space map
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                All visible connections in this Space (document mentions hidden by
                default).
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={includeMentions}
                onChange={(e) => setIncludeMentions(e.target.checked)}
              />
              Include MENTIONED_IN
            </label>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-ink-muted">Loading…</p>
          ) : spaceGraph ? (
            <div className="mt-4">
              <OntologySpaceMap
                graph={spaceGraph}
                selectedId={selectedId}
                onSelectEntity={openEntityFromMap}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "review" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Review queue
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Confirm or reject low-confidence extractions. Rejected items are hidden from
            Gideon and search.
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-ink-muted">Loading…</p>
          ) : reviewItems.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Nothing pending review.</p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {reviewItems.map((entry) => {
                if (entry.kind === "entity") {
                  const entity = entry.item;
                  return (
                    <li
                      key={`e-${entity.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{entity.name}</div>
                        <div className="mt-0.5 text-xs text-ink-muted">
                          entity · {entity.entity_type}
                          {entity.confidence != null
                            ? ` · ${Math.round(entity.confidence * 100)}%`
                            : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTab("entities");
                            void loadGraph(entity.id);
                          }}
                          className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs hover:bg-stone-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void reviewAction("entity", entity.id, "confirmed")
                          }
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void reviewAction("entity", entity.id, "rejected")
                          }
                          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  );
                }

                const rel = entry.item;
                return (
                  <li
                    key={`r-${rel.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium font-mono">
                        {entry.sourceName ?? "?"} —[{rel.relationship_type}]→{" "}
                        {entry.targetName ?? "?"}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        relationship
                        {rel.confidence != null
                          ? ` · ${Math.round(rel.confidence * 100)}%`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void reviewAction("relationship", rel.id, "confirmed")
                        }
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void reviewAction("relationship", rel.id, "rejected")
                        }
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : tab === "entities" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Entities
            </h2>
            {loading ? (
              <p className="mt-4 text-sm text-ink-muted">Loading…</p>
            ) : entities.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">No entities found.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {entities.map((entity) => (
                  <li key={entity.id}>
                    <button
                      type="button"
                      onClick={() => void loadGraph(entity.id)}
                      className={`w-full px-1 py-3 text-left text-sm hover:bg-stone-50 ${
                        selectedId === entity.id ? "bg-stone-50" : ""
                      }`}
                    >
                      <div className="font-medium">{entity.name}</div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {entity.entity_type}
                        {entity.confidence != null
                          ? ` · ${Math.round(entity.confidence * 100)}%`
                          : ""}
                        {entity.review_status === "pending" ? " · pending" : ""}
                        {entity.source_type ? ` · ${entity.source_type}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Entity details
            </h2>
            {!graph ? (
              <p className="mt-4 text-sm text-ink-muted">
                Select an entity to view relationships and evidence.
              </p>
            ) : (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <h3 className="text-lg font-semibold">{graph.entity.name}</h3>
                  <p className="text-ink-muted capitalize">{graph.entity.entity_type}</p>
                  {graph.entity.description ? (
                    <p className="mt-2">{graph.entity.description}</p>
                  ) : null}
                </div>

                {graph.aliases.length > 0 ? (
                  <div>
                    <h4 className="font-medium">Aliases</h4>
                    <p className="mt-1 text-ink-muted">
                      {graph.aliases.map((a) => a.alias).join(", ")}
                    </p>
                  </div>
                ) : null}

                <div>
                  <h4 className="mb-2 font-medium">Map</h4>
                  <OntologyGraphMap
                    graph={graph}
                    onSelectEntity={(id) => void loadGraph(id)}
                  />
                </div>

                {graph.outgoingRelationships.length > 0 ||
                graph.incomingRelationships.length > 0 ? (
                  <div>
                    <h4 className="font-medium">Relationships</h4>
                    <ul className="mt-2 space-y-1">
                      {graph.outgoingRelationships.map((rel) => (
                        <li key={rel.id} className="font-mono text-xs">
                          {rel.relationship_type} → {rel.targetEntity?.name ?? "?"}
                        </li>
                      ))}
                      {graph.incomingRelationships.map((rel) => (
                        <li key={rel.id} className="font-mono text-xs">
                          {rel.sourceEntity?.name ?? "?"} → {rel.relationship_type}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {graph.paths && graph.paths.length > 0 ? (
                  <div>
                    <h4 className="font-medium">Paths (up to 2 hops)</h4>
                    <ul className="mt-2 space-y-1">
                      {graph.paths.map((path, i) => (
                        <li key={`${path.label}-${i}`} className="font-mono text-xs">
                          {path.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {graph.evidence.length > 0 ? (
                  <div>
                    <h4 className="font-medium">Evidence</h4>
                    <ul className="mt-2 space-y-3">
                      {graph.evidence.slice(0, 5).map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-xs"
                        >
                          {ev.documentName ? (
                            <p className="font-medium">Document: {ev.documentName}</p>
                          ) : null}
                          {ev.evidence_text ? (
                            <p className="mt-1 italic text-ink-muted">
                              &ldquo;{ev.evidence_text}&rdquo;
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Backfill (admin)
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Re-run ontology extraction on existing indexed documents in this space.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[1, 5, 10].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void runBackfill(n)}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              Backfill {n} doc{n > 1 ? "s" : ""}
            </button>
          ))}
        </div>
        {backfillResult ? (
          <p className="mt-3 text-sm text-ink-muted">{backfillResult}</p>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active
          ? "bg-stone-900 text-white"
          : "border border-stone-200 bg-white text-ink hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
