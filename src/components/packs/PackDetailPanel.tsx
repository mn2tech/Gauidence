"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalyzeKnowledgeSelection,
  PackDefinition,
  ProfilePackRow,
} from "@/lib/packs/types";

type Tab = "overview" | "install" | "configure" | "analyze" | "success";

type Props = {
  slug: string;
  profileId: string;
  profileName: string;
  initialTab?: string;
};

export default function PackDetailPanel({
  slug,
  profileId,
  profileName,
  initialTab,
}: Props) {
  const [definition, setDefinition] = useState<PackDefinition | null>(null);
  const [installation, setInstallation] = useState<ProfilePackRow | null>(null);
  const [installableError, setInstallableError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successSpaces, setSuccessSpaces] = useState<
    Array<{ key: string; displayName: string; reused: boolean }>
  >([]);
  const [analyzePreview, setAnalyzePreview] = useState<{
    documents: Array<{ id: string; fileName: string }>;
    proposals: Array<{ id: string; title: string }>;
    sourceItems: Array<{ id: string; name: string }>;
  } | null>(null);
  const [includeAllDocuments, setIncludeAllDocuments] = useState(true);
  const [includeAllProposals, setIncludeAllProposals] = useState(true);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packs/${encodeURIComponent(slug)}?profileId=${encodeURIComponent(profileId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load pack.");
      }
      const data = await res.json();
      setDefinition(data.definition);
      setInstallation(data.installation);
      setInstallableError(data.installableError);
      const defaults = (data.definition?.spaces ?? [])
        .filter((s: { default_selected: boolean }) => s.default_selected)
        .map((s: { key: string }) => s.key);
      const fromConfig =
        data.installation?.configuration?.selectedSpaceKeys ?? defaults;
      setSelectedKeys(fromConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [slug, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialTab) return;
    if (
      initialTab === "install" ||
      initialTab === "configure" ||
      initialTab === "analyze" ||
      initialTab === "overview"
    ) {
      setTab(initialTab);
    }
  }, [initialTab]);

  const installed = installation?.status === "installed";

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const runInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/packs/${encodeURIComponent(slug)}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          selectedSpaceKeys: selectedKeys,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Install failed.");
      setInstallation(data.installation);
      setSuccessSpaces(data.spaces ?? []);
      setTab("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setBusy(false);
    }
  };

  const selection: AnalyzeKnowledgeSelection = useMemo(
    () => ({
      includeAllDocuments,
      includeAllProposals,
    }),
    [includeAllDocuments, includeAllProposals]
  );

  const previewAnalyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/packs/${encodeURIComponent(slug)}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          preview: true,
          ...selection,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Preview failed.");
      setAnalyzePreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const startAnalyze = async () => {
    setBusy(true);
    setError(null);
    setAnalyzeResult(null);
    try {
      const res = await fetch(`/api/packs/${encodeURIComponent(slug)}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          ...selection,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyze failed.");
      const r = data.result;
      setAnalyzeResult(
        `Queued ${r.documentsQueued} document(s) for ontology extraction` +
          (r.proposalsNoted ? `, noted ${r.proposalsNoted} proposal(s)` : "") +
          (r.sourceItemsQueued
            ? `, queued ${r.sourceItemsQueued} connected source item(s)`
            : "") +
          "."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyze failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading pack…</p>;
  }

  if (!definition) {
    return (
      <p className="text-sm text-red-700">{error ?? "Pack not found."}</p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          Pack #{String(definition.pack.pack_number ?? "").padStart(3, "0")} · v
          {definition.version.version}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {definition.pack.name}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {definition.pack.description}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Installing into <span className="font-medium text-ink">{profileName}</span>
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {installableError && !installed ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {installableError} Switch to a business or nonprofit Space to install.
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-2 border-b border-stone-200 pb-3 text-sm">
        {(
          [
            ["overview", "Overview"],
            ["install", installed ? "Reconfigure Spaces" : "Install"],
            ...(installed
              ? ([
                  ["analyze", "Analyze Knowledge"],
                  ["configure", "Details"],
                ] as const)
              : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id || (tab === "success" && id === "install")
                ? "rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white"
                : "rounded-lg px-3 py-1.5 text-ink-muted hover:bg-stone-100"
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" || tab === "configure" ? (
        <div className="space-y-6 text-sm">
          <section>
            <h2 className="font-semibold">Entity types</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {definition.entityTypes.map((e) => (
                <li
                  key={e.key}
                  className="rounded-md bg-stone-100 px-2 py-1 text-xs"
                >
                  {e.label}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold">Relationships</h2>
            <ul className="mt-2 space-y-1 text-ink-muted">
              {definition.relationshipTypes.map((r) => (
                <li key={r.key}>
                  <span className="font-mono text-xs text-ink">{r.key}</span>
                  {" — "}
                  {r.source_entity_type} → {r.target_entity_type}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold">Gideon skills</h2>
            <ul className="mt-2 space-y-2">
              {definition.gideonSkills.map((s) => (
                <li key={s.key}>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-ink-muted">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold">Starter questions</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
              {definition.starterQuestions.map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
            </ul>
          </section>
          {installed ? (
            <p className="flex flex-wrap gap-3">
              <a
                href={`/settings/packs/${slug}/dashboard?profileId=${encodeURIComponent(profileId)}`}
                className="font-semibold text-brand hover:text-brand-dark"
              >
                View Business Dashboard →
              </a>
              <a
                href={`/settings/packs/${slug}/ontology?profileId=${encodeURIComponent(profileId)}`}
                className="font-semibold text-brand hover:text-brand-dark"
              >
                Ontology Explorer →
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {(tab === "install" || tab === "success") && tab !== "success" ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Recommended setup</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Choose which Spaces to create. Existing Spaces with the same name
              are reused — nothing is duplicated.
            </p>
          </div>
          <ul className="space-y-3">
            {definition.spaces.map((space) => (
              <li key={space.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedKeys.includes(space.key)}
                    onChange={() => toggleKey(space.key)}
                  />
                  <span>
                    <span className="font-medium">{space.display_name}</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {space.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || Boolean(installableError)}
            onClick={() => void runInstall()}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy
              ? "Installing…"
              : installed
                ? "Update recommended Spaces"
                : "Install Business Pack"}
          </button>
        </div>
      ) : null}

      {tab === "success" ? (
        <div className="space-y-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-lg font-semibold text-emerald-950">
            {definition.pack.name} is ready.
          </h2>
          <p className="text-sm text-emerald-900">
            Version {definition.version.version} is installed on {profileName}.
          </p>
          {successSpaces.length ? (
            <ul className="text-sm text-emerald-900">
              {successSpaces.map((s) => (
                <li key={s.key}>
                  {s.displayName}
                  {s.reused ? " (reused existing Space)" : " (created)"}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTab("analyze")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Analyze Existing Knowledge
            </button>
            <a
              href="/"
              className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium"
            >
              Ask Gideon
            </a>
            <a
              href={`/settings/packs/${slug}/dashboard?profileId=${encodeURIComponent(profileId)}`}
              className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium"
            >
              View Business Dashboard
            </a>
          </div>
        </div>
      ) : null}

      {tab === "analyze" ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Analyze existing knowledge</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Guardian will not analyze everything automatically. Choose what to
              include, preview the selection, then start. Analysis runs
              asynchronously using the existing ontology pipeline.
            </p>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAllDocuments}
                onChange={(e) => setIncludeAllDocuments(e.target.checked)}
              />
              Documents in this Space and selected child Spaces
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAllProposals}
                onChange={(e) => setIncludeAllProposals(e.target.checked)}
              />
              Proposals for this business
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void previewAnalyze()}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Preview selection
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startAnalyze()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Working…" : "Start analysis"}
            </button>
          </div>
          {analyzePreview ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
              <p className="font-medium">Will analyze:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
                <li>{analyzePreview.documents.length} document(s)</li>
                <li>{analyzePreview.proposals.length} proposal(s)</li>
                <li>{analyzePreview.sourceItems.length} connected source item(s)</li>
              </ul>
              {analyzePreview.documents.length > 0 ? (
                <ul className="mt-3 max-h-40 overflow-auto text-xs text-ink-muted">
                  {analyzePreview.documents.slice(0, 20).map((d) => (
                    <li key={d.id}>{d.fileName}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {analyzeResult ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {analyzeResult}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
