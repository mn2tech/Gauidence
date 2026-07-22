"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pencil,
} from "lucide-react";
import EndSessionModal from "@/components/EndSessionModal";
import {
  formatWorkActivity,
  WORK_PROJECT_STATUSES,
  WORK_STATUS_LABELS,
  type WorkProject,
  type WorkProjectStatus,
  type WorkSession,
} from "@/lib/work-memory/types";

type Props = {
  project: WorkProject;
  sessions: WorkSession[];
  profileName: string | null;
};

export default function WorkProjectDetail({
  project: initialProject,
  sessions: initialSessions,
  profileName,
}: Props) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [sessions, setSessions] = useState(initialSessions);
  const [endOpen, setEndOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(project.name);
  const [mission, setMission] = useState(project.mission ?? "");
  const [currentStep, setCurrentStep] = useState(project.current_step ?? "");
  const [nextAction, setNextAction] = useState(project.next_action ?? "");
  const [blockers, setBlockers] = useState(project.blockers ?? "");
  const [status, setStatus] = useState<WorkProjectStatus>(project.status);

  const lastSession = sessions[0] ?? null;

  useEffect(() => {
    void fetch(`/api/work-memory/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touchOpened: true }),
    });
  }, [project.id]);

  async function saveEdits() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-memory/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mission,
          currentStep,
          nextAction,
          blockers,
          status,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: WorkProject;
      };
      if (!res.ok || !body.project) {
        setError(body.error ?? "Couldn't save changes.");
        return;
      }
      setProject(body.project);
      setEditing(false);
    } catch {
      setError("Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function finishMission() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-memory/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: WorkProject;
      };
      if (!res.ok || !body.project) {
        setError(body.error ?? "Couldn't finish mission.");
        return;
      }
      router.push("/work-memory");
      router.refresh();
    } catch {
      setError("Couldn't finish mission.");
    } finally {
      setBusy(false);
    }
  }

  function handleSessionSaved() {
    void fetch(`/api/work-memory/projects/${project.id}`)
      .then((r) => r.json())
      .then((body: { project?: WorkProject; sessions?: WorkSession[] }) => {
        if (body.project) setProject(body.project);
        if (body.sessions) setSessions(body.sessions);
      })
      .catch(() => {});
    router.refresh();
  }

  const vaultHref = project.profile_id
    ? `/dashboard#documents-${project.profile_id}`
    : "/dashboard";

  return (
    <div>
      <Link
        href="/work-memory"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-dark"
      >
        <ArrowLeft className="h-4 w-4" />
        Work Memory
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {WORK_STATUS_LABELS[project.status]} · Last activity{" "}
            {formatWorkActivity(project.last_activity_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:bg-stone-50"
        >
          <Pencil className="h-4 w-4" />
          {editing ? "Cancel edit" : "Update progress"}
        </button>
      </div>

      {lastSession ? (
        <div className="mt-6 rounded-2xl border border-brand/30 bg-brand-light/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
            You stopped here
          </p>
          {lastSession.accomplished ? (
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">Accomplished:</span>{" "}
              {lastSession.accomplished}
            </p>
          ) : null}
          {lastSession.next_step ? (
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">Next step:</span>{" "}
              {lastSession.next_step}
            </p>
          ) : null}
          {lastSession.blockers ? (
            <p className="mt-2 text-sm text-red-800">
              <span className="font-medium">Blocked:</span>{" "}
              {lastSession.blockers}
            </p>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Mission</span>
            <textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Current step</span>
            <textarea
              value={currentStep}
              onChange={(e) => setCurrentStep(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Next action</span>
            <textarea
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Blockers</span>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkProjectStatus)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              {WORK_PROJECT_STATUSES.filter((s) => s !== "archived").map(
                (s) => (
                  <option key={s} value={s}>
                    {WORK_STATUS_LABELS[s]}
                  </option>
                )
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveEdits()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {project.mission ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Current mission
              </p>
              <p className="mt-1 text-sm">{project.mission}</p>
            </div>
          ) : null}
          {project.current_step ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Current step
              </p>
              <p className="mt-1 text-sm">{project.current_step}</p>
            </div>
          ) : null}
          {project.next_action ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Next action
              </p>
              <p className="mt-1 text-sm font-medium">{project.next_action}</p>
            </div>
          ) : null}
          {project.blockers ? (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-xs font-semibold uppercase text-red-800">
                Blocked by
              </p>
              <p className="mt-1 text-sm text-red-900">{project.blockers}</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={vaultHref}
          className="inline-flex items-center rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Continue working
        </Link>
        <button
          type="button"
          onClick={() => setEndOpen(true)}
          className="rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
        >
          End session
        </button>
        <Link
          href="/ask"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
        >
          <MessageCircle className="h-4 w-4" />
          Ask Gideon
        </Link>
        {project.status !== "done" ? (
          <button
            type="button"
            onClick={() => void finishMission()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Finish mission
          </button>
        ) : null}
      </div>

      {profileName ? (
        <p className="mt-4 text-sm text-ink-muted">
          Linked vault:{" "}
          <Link href={vaultHref} className="font-semibold text-brand">
            {profileName}
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-base font-semibold">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No sessions yet. Use End session when you pause work.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-xl border border-stone-200 bg-white p-4 text-sm"
              >
                <p className="font-medium text-ink-muted">
                  {formatWorkActivity(session.ended_at)}
                </p>
                {session.accomplished ? (
                  <p className="mt-1">{session.accomplished}</p>
                ) : null}
                {session.next_step ? (
                  <p className="mt-1 text-ink-muted">
                    Next: {session.next_step}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <EndSessionModal
        open={endOpen}
        projectId={project.id}
        projectName={project.name}
        initialNextAction={project.next_action}
        initialStatus={project.status}
        onClose={() => setEndOpen(false)}
        onSaved={handleSessionSaved}
      />
    </div>
  );
}
