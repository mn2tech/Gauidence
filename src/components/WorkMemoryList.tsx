"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import WorkProjectCard from "@/components/WorkProjectCard";
import type { WorkProject } from "@/lib/work-memory/types";
import { useActiveProfile } from "@/components/ProfileProvider";

type Props = {
  initialProjects: WorkProject[];
};

export default function WorkMemoryList({ initialProjects }: Props) {
  const { profiles } = useActiveProfile();
  const [projects, setProjects] = useState(initialProjects);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/work-memory/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          mission: mission.trim() || undefined,
          profileId: profileId || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: WorkProject;
      };
      if (!res.ok || !body.project) {
        setError(body.error ?? "Couldn't create project.");
        return;
      }
      setProjects((prev) => [body.project!, ...prev]);
      setName("");
      setMission("");
      setProfileId("");
      setShowForm(false);
    } catch {
      setError("Couldn't create project. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const active = projects.filter((p) => p.status !== "done");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {active.length} active project{active.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mt-4 rounded-2xl border border-stone-200 bg-white p-5"
        >
          <h2 className="text-sm font-semibold">Start a project</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                placeholder="Guardian Sprint 10"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Current mission (optional)</span>
              <input
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                placeholder="Finish Work Memory"
              />
            </label>
            {profiles.length > 0 ? (
              <label className="block">
                <span className="text-sm font-medium">
                  Link to vault (optional)
                </span>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No projects yet
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Start a project so Guardian remembers your mission, next step, and
            where you left off.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <WorkProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
