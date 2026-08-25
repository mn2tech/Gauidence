"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParentDashboardPayload } from "@/lib/mcps-parent/types";
import MySchoolSetup from "./MySchoolSetup";
import WhatMattersCard from "./WhatMattersCard";
import AskMySchoolPanel from "./AskMySchoolPanel";

export default function ParentHomeClient() {
  const [data, setData] = useState<ParentDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchool, setEditingSchool] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/mcps-parent/dashboard", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as ParentDashboardPayload & {
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Could not load parent home.");
      setLoading(false);
      return;
    }
    setData(body);
    setEditingSchool(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }

  if (!data || data.state === "needs_setup" || editingSchool) {
    return (
      <div className="space-y-6">
        {!editingSchool ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold">
              Make Guardian useful for your family.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
              Select your school and grade to see what matters this week.
            </p>
          </div>
        ) : null}
        <MySchoolSetup
          initialSchool={data?.context?.school_name ?? ""}
          initialGrade={data?.context?.grade_level ?? "9"}
          onSaved={() => void load()}
        />
      </div>
    );
  }

  const ctx = data.context!;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm text-ink-muted">{data.greeting}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Here&apos;s what matters for your school.
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-foreground">
            {ctx.school_name}
          </span>
          <span className="text-ink-muted">·</span>
          <span className="text-ink-muted">
            Grade {ctx.grade_level}
          </span>
          <button
            type="button"
            onClick={() => setEditingSchool(true)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Edit My School
          </button>
        </div>
      </header>

      {data.state === "caught_up" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">You&apos;re caught up.</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Guardian doesn&apos;t see anything urgent for your school right now.
          </p>
          <a
            href="#ask-gideon"
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Ask Gideon
          </a>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What you need to know</h2>
          <div className="space-y-4">
            {data.what_you_need.map((item) => (
              <WhatMattersCard
                key={item.id}
                item={item}
                schoolName={ctx.school_name}
              />
            ))}
          </div>
        </section>
      )}

      {data.coming_up.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Coming Up</h2>
          <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            {data.coming_up.map((group) => (
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
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-ink-muted">
                        {item.event_date ?? item.reasons[0] ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <AskMySchoolPanel suggestedQuestions={data.suggested_questions} />

      <p className="text-xs leading-relaxed text-ink-muted">
        Guardian for MCPS Parents is an independent information assistant and is
        not affiliated with or endorsed by Montgomery County Public Schools.
        Verify time-sensitive decisions with MCPS.
      </p>
    </div>
  );
}
