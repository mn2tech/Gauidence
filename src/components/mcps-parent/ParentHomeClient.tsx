"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MAX_PARENT_SCHOOL_CONTEXTS,
  PARENT_VIEW_STORAGE_KEY,
} from "@/lib/mcps-parent/constants";
import { formatParentDate } from "@/lib/mcps-parent/display";
import {
  displayContextSwitcherOption,
  formatAppliesTo,
} from "@/lib/mcps-parent/family";
import type { ParentDashboardPayload } from "@/lib/mcps-parent/types";
import MyChildrenManager from "./MyChildrenManager";
import WhatMattersCard from "./WhatMattersCard";
import AskMySchoolPanel from "./AskMySchoolPanel";

function readStoredView(): string {
  if (typeof window === "undefined") return "all";
  try {
    return sessionStorage.getItem(PARENT_VIEW_STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

function writeStoredView(view: string) {
  try {
    sessionStorage.setItem(PARENT_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

export default function ParentHomeClient() {
  const [data, setData] = useState<ParentDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [activeView, setActiveView] = useState<string>("all");
  const [showAllItems, setShowAllItems] = useState(false);

  const load = useCallback(async (view?: string) => {
    setError(null);
    const v = view ?? activeView;
    const res = await fetch(
      `/api/mcps-parent/dashboard?view=${encodeURIComponent(v)}`,
      { cache: "no-store" }
    );
    const body = (await res.json().catch(() => ({}))) as ParentDashboardPayload & {
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Could not load parent home.");
      setLoading(false);
      return;
    }
    setData(body);
    if (body.state === "needs_setup" || !(body.contexts?.length)) {
      setManaging(true);
    }
    setLoading(false);
  }, [activeView]);

  useEffect(() => {
    const stored = readStoredView();
    setActiveView(stored);
    void load(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  function changeView(view: string) {
    setActiveView(view);
    writeStoredView(view);
    setShowAllItems(false);
    setLoading(true);
    void load(view);
  }

  if (loading && !data) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (error && !data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }

  const contexts = data?.contexts ?? [];
  const needsSetup = !data || data.state === "needs_setup" || contexts.length === 0;

  if (needsSetup || managing) {
    return (
      <div className="space-y-6">
        {needsSetup && !managing ? null : contexts.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold">
              Make Guardian useful for your family.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
              Add a school and grade so Guardian can tell you what matters.
            </p>
          </div>
        ) : null}
        <MyChildrenManager
          contexts={contexts}
          maxContexts={data?.max_contexts ?? MAX_PARENT_SCHOOL_CONTEXTS}
          onChanged={() => {
            setLoading(true);
            void load(activeView);
          }}
          onDone={
            contexts.length > 0
              ? () => {
                  setManaging(false);
                  setLoading(true);
                  void load(activeView);
                }
              : undefined
          }
        />
      </div>
    );
  }

  const primary = data!.primary_context ?? data!.context;
  const visibleItems = showAllItems
    ? data!.what_you_need
    : data!.what_you_need.slice(0, 5);
  const hasMore = data!.what_you_need.length > 5;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-ink-muted">{data!.greeting}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {activeView === "all"
            ? "Here's what matters to your family."
            : "Here's what matters for your school."}
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:max-w-md">
            <span className="text-xs font-medium text-ink-muted">Viewing</span>
            <select
              value={activeView}
              onChange={(e) => changeView(e.target.value)}
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">All Children</option>
              {contexts.map((ctx) => (
                <option key={ctx.id} value={ctx.id}>
                  {displayContextSwitcherOption(ctx)}
                  {ctx.is_primary ? " (Primary)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="self-start text-xs font-semibold text-brand hover:underline sm:self-end sm:pb-2"
          >
            Manage My Children
          </button>
        </div>

        {primary && activeView !== "all" ? (
          <p className="text-sm text-ink-muted">
            Focusing on{" "}
            <span className="font-medium text-foreground">
              {displayContextSwitcherOption(
                contexts.find((c) => c.id === activeView) ?? primary
              )}
            </span>
          </p>
        ) : null}
      </header>

      {data!.state === "caught_up" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">You&apos;re caught up.</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Guardian doesn&apos;t see anything urgent for your family right now.
          </p>
          <a
            href="#ask-gideon"
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            What matters to my family?
          </a>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold">What you need to know</h2>
            {activeView === "all" ? (
              <a
                href="#ask-gideon"
                className="text-xs font-semibold text-brand hover:underline"
              >
                What matters to my family?
              </a>
            ) : null}
          </div>
          <div className="space-y-4">
            {visibleItems.map((item) => (
              <WhatMattersCard
                key={item.id}
                item={item}
                appliesTo={formatAppliesTo({
                  districtWide: Boolean(item.district_wide),
                  labels: item.applies_to_labels ?? [],
                  totalContexts: contexts.length,
                })}
                contextId={
                  item.district_wide
                    ? null
                    : item.applies_to_context_ids?.[0] ?? null
                }
              />
            ))}
          </div>
          {hasMore && !showAllItems ? (
            <button
              type="button"
              onClick={() => setShowAllItems(true)}
              className="text-sm font-semibold text-brand hover:underline"
            >
              View All
            </button>
          ) : null}
        </section>
      )}

      {data!.coming_up.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Coming Up</h2>
          <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            {data!.coming_up.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {group.label}
                </h3>
                <ul className="mt-2 space-y-2">
                  {group.items.slice(0, 4).map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 py-2 text-sm last:border-0"
                    >
                      <span>
                        <span className="font-medium">{item.title}</span>
                        {item.applies_to_labels?.length ? (
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            {formatAppliesTo({
                              districtWide: Boolean(item.district_wide),
                              labels: item.applies_to_labels,
                              totalContexts: contexts.length,
                            })}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {item.event_date
                          ? formatParentDate(item.event_date)
                          : (item.reasons[0] ?? "")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <AskMySchoolPanel
        suggestedQuestions={data!.suggested_questions}
        activeView={activeView}
        familyMode={activeView === "all"}
      />

      <p className="text-xs leading-relaxed text-ink-muted">
        Guardian for MCPS Parents is an independent information assistant and is
        not affiliated with or endorsed by Montgomery County Public Schools.
        Verify time-sensitive decisions with MCPS.
      </p>
    </div>
  );
}
