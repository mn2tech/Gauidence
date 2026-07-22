"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  WORK_PROJECT_STATUSES,
  WORK_STATUS_LABELS,
  type WorkProjectStatus,
} from "@/lib/work-memory/types";

type Props = {
  open: boolean;
  projectName: string;
  initialNextAction?: string | null;
  initialStatus?: WorkProjectStatus;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
};

export default function EndSessionModal({
  open,
  projectName,
  initialNextAction,
  initialStatus = "in_progress",
  onClose,
  onSaved,
  projectId,
}: Props) {
  const [accomplished, setAccomplished] = useState("");
  const [nextStep, setNextStep] = useState(initialNextAction ?? "");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<WorkProjectStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/work-memory/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accomplished,
            nextStep,
            blockers,
            notes,
            status,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save session.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Couldn't save session. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-session-title"
    >
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="end-session-title" className="text-lg font-semibold">
              Before you leave
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Quick capture for <span className="font-medium">{projectName}</span>{" "}
              — under 20 seconds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-muted hover:bg-stone-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">What did you accomplish?</span>
            <textarea
              value={accomplished}
              onChange={(e) => setAccomplished(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              placeholder="Shipped the API routes…"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Next step</span>
            <textarea
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              placeholder="Test profile permissions…"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Anything blocking you?</span>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              placeholder="Need test accounts…"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Additional notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Status</span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as WorkProjectStatus)
              }
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
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save session
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
