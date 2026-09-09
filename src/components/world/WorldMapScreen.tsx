"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  X,
} from "lucide-react";
import type { WorldEntityDetail } from "@/lib/world/apiTypes";
import type { WorldMapGraph, WorldMapNode } from "@/lib/world/mapGraph";
import { worldMapNodePosition } from "@/lib/world/mapGraph";
import {
  WORLD_PATH,
  askAboutWorldEntityHref,
  worldEntityHref,
} from "@/lib/routes";

type GroupKey = "people" | "organizations" | "events" | "things";

const SIZE = 420;

export default function WorldMapScreen() {
  const [expanded, setExpanded] = useState<GroupKey[]>([
    "people",
    "organizations",
    "events",
    "things",
  ]);
  const [graph, setGraph] = useState<WorldMapGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const expand = expanded.join(",");
      const res = await fetch(
        `/api/world/map?expand=${encodeURIComponent(expand)}&max=25`
      );
      const body = (await res.json().catch(() => ({}))) as WorldMapGraph & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load map.");
        setGraph(null);
        return;
      }
      setGraph(body);
    } catch {
      setError("Couldn't reach Guardian.");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [expanded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!drawerId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/world/entities/${encodeURIComponent(drawerId)}`
        );
        const body = (await res.json().catch(() => ({}))) as WorldEntityDetail & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDetail(null);
          return;
        }
        setDetail(body);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerId]);

  const positions = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const map = new Map<string, { x: number; y: number }>();
    for (const n of graph.nodes) {
      map.set(n.id, worldMapNodePosition(n, SIZE));
    }
    return map;
  }, [graph]);

  function toggleGroup(g: GroupKey) {
    setExpanded((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  }

  function onNodeClick(node: WorldMapNode) {
    if (node.kind === "group" && node.group) {
      toggleGroup(node.group);
      return;
    }
    if (node.kind === "entity" && node.entityId) {
      setDrawerId(node.entityId);
    }
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Link
        href={WORLD_PATH}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> My World
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">World Map</h1>
        <p className="mt-1 text-sm text-ink-muted">
          You at the center. Tap a group to expand or collapse. Tap anyone
          Guardian knows to see details.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your map…
        </p>
      ) : graph ? (
        <div className="simple-home-card relative overflow-hidden p-3 sm:p-4">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="mx-auto h-auto w-full max-w-md"
            role="img"
            aria-label="Map of your world"
          >
            {graph.edges.map((e) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.from}-${e.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#d6d3d1"
                  strokeWidth={1.5}
                />
              );
            })}
            {graph.nodes.map((node) => {
              const p = positions.get(node.id);
              if (!p) return null;
              const r =
                node.kind === "user" ? 28 : node.kind === "group" ? 22 : 16;
              const fill =
                node.kind === "user"
                  ? "#1c1917"
                  : node.kind === "group"
                    ? "#f5f5f4"
                    : "#fff";
              const stroke =
                node.kind === "user" ? "#1c1917" : "#a8a29e";
              const textFill = node.kind === "user" ? "#fff" : "#1c1917";
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer"
                  onClick={() => onNodeClick(node)}
                >
                  <circle
                    r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={textFill}
                    fontSize={node.kind === "entity" ? 9 : 11}
                    fontWeight={600}
                    className="pointer-events-none select-none"
                  >
                    {node.label.length > 14
                      ? `${node.label.slice(0, 12)}…`
                      : node.label}
                  </text>
                  {node.kind === "group" && node.childCount != null ? (
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      fill="#78716c"
                      fontSize={9}
                      className="pointer-events-none"
                    >
                      {node.childCount}
                      {expanded.includes(node.group!) ? " · tap to collapse" : " · tap to expand"}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-center text-xs text-ink-muted">
            Showing {graph.nodes.length} of up to {graph.maxNodes} nodes
            {graph.totalEntities > graph.nodes.filter((n) => n.kind === "entity").length
              ? ` · ${graph.totalEntities} known in total`
              : ""}
          </p>
        </div>
      ) : null}

      {/* Entity detail drawer */}
      {drawerId ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Details"
          onClick={() => setDrawerId(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="font-semibold">Details</h2>
              <button
                type="button"
                onClick={() => setDrawerId(null)}
                className="rounded-lg p-1.5 hover:bg-stone-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : detail ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-ink-muted">
                      {detail.entity.typeLabel}
                    </p>
                    <h3 className="text-xl font-semibold">{detail.entity.name}</h3>
                    {detail.description ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        {detail.description}
                      </p>
                    ) : null}
                  </div>
                  {detail.relatedPeople.length > 0 ? (
                    <div>
                      <p className="text-sm font-semibold">Related people</p>
                      <ul className="mt-1 text-sm text-ink-muted">
                        {detail.relatedPeople.slice(0, 5).map((p) => (
                          <li key={p.id}>{p.name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <Link
                      href={askAboutWorldEntityHref({
                        entityId: detail.entity.id,
                        entityName: detail.entity.name,
                        spaceId: detail.primarySpaceId,
                      })}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Ask Gideon about {detail.entity.name}
                    </Link>
                    <Link
                      href={worldEntityHref(detail.entity.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold"
                    >
                      Open full page
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Couldn&apos;t load details.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
