"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import {
  formatWorkActivity,
  WORK_STATUS_LABELS,
  type WorkProject,
} from "@/lib/work-memory/types";

type Props = {
  project: WorkProject;
};

export default function WorkProjectCard({ project }: Props) {
  const statusClass =
    project.status === "blocked"
      ? "bg-red-100 text-red-800"
      : project.status === "waiting"
        ? "bg-amber-100 text-amber-800"
        : project.status === "done"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-brand-light text-brand-dark";

  return (
    <article className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">
            {project.name}
          </h2>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}
          >
            {WORK_STATUS_LABELS[project.status]}
          </span>
        </div>
        {project.estimated_resume_minutes ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            ~{project.estimated_resume_minutes}m
          </span>
        ) : null}
      </div>

      {project.mission ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Current mission
          </p>
          <p className="mt-1 text-sm text-foreground">{project.mission}</p>
        </div>
      ) : null}

      {project.current_step ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Current step
          </p>
          <p className="mt-1 text-sm text-foreground">{project.current_step}</p>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-ink-muted">
        Last activity: {formatWorkActivity(project.last_activity_at)}
      </p>

      {project.next_action ? (
        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs font-semibold text-ink-muted">Next action</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {project.next_action}
          </p>
        </div>
      ) : null}

      {project.blockers ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Blocked by
          </p>
          <p className="mt-1 text-sm text-red-800">{project.blockers}</p>
        </div>
      ) : null}

      <Link
        href={`/work-memory/${project.id}`}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
      >
        Resume
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
