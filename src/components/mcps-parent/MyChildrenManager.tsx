"use client";

import { useState, type FormEvent } from "react";
import {
  GRADE_OPTIONS,
  MAX_PARENT_SCHOOL_CONTEXTS,
} from "@/lib/mcps-parent/constants";
import { resolveMcpsSchoolName } from "@/lib/mcps-parent/schools";
import {
  displayContextLabel,
} from "@/lib/mcps-parent/family";
import type { ParentSchoolContext } from "@/lib/mcps-parent/types";
import SchoolSelect from "./SchoolSelect";

type FormState = {
  label: string;
  school: string;
  grade: string;
  makePrimary: boolean;
};

const emptyForm = (makePrimary: boolean): FormState => ({
  label: "",
  school: "",
  grade: "9",
  makePrimary,
});

export default function MyChildrenManager({
  contexts,
  maxContexts = MAX_PARENT_SCHOOL_CONTEXTS,
  onChanged,
  onDone,
}: {
  contexts: ParentSchoolContext[];
  maxContexts?: number;
  onChanged?: () => void;
  onDone?: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm(contexts.length === 0));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(contexts.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = contexts.length >= maxContexts && !editingId;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const school_name = resolveMcpsSchoolName(form.school) ?? form.school.trim();
      const payload = {
        school_name,
        grade_level: form.grade,
        label: form.label.trim() || null,
        make_primary: form.makePrimary,
      };

      const res = editingId
        ? await fetch(`/api/mcps-parent/contexts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/mcps-parent/contexts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save.");
        return;
      }
      setEditingId(null);
      setShowForm(false);
      setForm(emptyForm(false));
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(ctx: ParentSchoolContext) {
    setEditingId(ctx.id);
    setShowForm(true);
    setForm({
      label: ctx.label ?? "",
      school: ctx.school_name,
      grade: ctx.grade_level,
      makePrimary: ctx.is_primary,
    });
    setError(null);
  }

  function startAdd() {
    setEditingId(null);
    setShowForm(true);
    setForm(emptyForm(contexts.length === 0));
    setError(null);
  }

  async function makePrimary(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mcps-parent/contexts/${id}/primary`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not update primary.");
        return;
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function remove(ctx: ParentSchoolContext) {
    const label = displayContextLabel(ctx);
    if (
      !window.confirm(
        `Remove ${label} (${ctx.school_name}, Grade ${ctx.grade_level})?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mcps-parent/contexts/${ctx.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not remove.");
        return;
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">My Children</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Add up to {maxContexts} school and grade profiles so Guardian can show
          what matters for your family. No student ID or ParentVUE login needed.
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          You can use &quot;Child 1&quot; instead of a child&apos;s name.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {contexts.length > 0 ? (
        <ul className="space-y-3">
          {contexts.map((ctx) => (
            <li
              key={ctx.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {displayContextLabel(ctx)}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {ctx.school_name}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Grade {ctx.grade_level}
                  </p>
                </div>
                {ctx.is_primary ? (
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                    Primary
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!ctx.is_primary ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void makePrimary(ctx.id)}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60"
                  >
                    Make Primary
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startEdit(ctx)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(ctx)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showForm ? (
        <form
          onSubmit={(e) => void save(e)}
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold">
            {editingId ? "Edit child / school" : "Add Child / School"}
          </h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="child-label">
              Label <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="child-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Child 1, Matthew…"
              maxLength={80}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="school">
              School
            </label>
            <SchoolSelect
              id="school"
              required
              value={form.school}
              onChange={(school) => setForm((f) => ({ ...f, school }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="grade">
              Grade
            </label>
            <select
              id="grade"
              required
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g === "K" || g === "Pre-K" ? g : `Grade ${g}`}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.makePrimary || contexts.length === 0}
              disabled={contexts.length === 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, makePrimary: e.target.checked }))
              }
            />
            Make this my primary school
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !form.school}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {contexts.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {atLimit ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Guardian currently supports up to {maxContexts} school profiles
              per parent account.
            </p>
          ) : (
            <button
              type="button"
              onClick={startAdd}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Add Child / School
            </button>
          )}
          {contexts.length > 0 && onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Done
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
