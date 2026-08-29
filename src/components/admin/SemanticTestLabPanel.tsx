"use client";

import { useCallback, useEffect, useState } from "react";

const EXAMPLE = `NM2TECH supports Treasury TTB through Onyx Government Services. Onyx asked Michael to identify a CI/CD engineer for the TTB contract.`;

type LabResult = {
  entities: unknown[];
  relationships: unknown[];
  facts: unknown[];
  actions?: unknown[];
  warnings?: string[];
  evidence?: unknown;
  entityResolution?: unknown[];
  ingest?: unknown;
  error?: string;
};

type BackfillStatus = {
  enabled?: boolean;
  spaceCount: number;
  analyzedSources: number;
  semanticPending: number;
  semanticCompleted: number;
  semanticFailed: number;
  semanticProcessing: number;
  semanticSkipped: number;
};

type BackfillQueueResult = {
  ok?: boolean;
  queued?: number;
  skipped?: number;
  spaceCount?: number;
  remainingEstimate?: number | null;
  note?: string;
  error?: string;
  status?: BackfillStatus;
};

export default function SemanticTestLabPanel() {
  const [content, setContent] = useState(EXAMPLE);
  const [persist, setPersist] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);

  const [backfillStatus, setBackfillStatus] = useState<BackfillStatus | null>(
    null
  );
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);

  const refreshBackfillStatus = useCallback(async () => {
    const res = await fetch("/api/admin/semantic-backfill");
    const body = (await res.json().catch(() => ({}))) as BackfillStatus & {
      error?: string;
    };
    if (res.ok) {
      setBackfillStatus(body);
    }
  }, []);

  useEffect(() => {
    void refreshBackfillStatus();
  }, [refreshBackfillStatus]);

  async function analyze() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/semantic-test-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, persist }),
      });
      const body = (await res.json().catch(() => ({}))) as LabResult;
      if (!res.ok) {
        setResult({
          entities: [],
          relationships: [],
          facts: [],
          error: body.error ?? "Analyze failed",
        });
        return;
      }
      setResult(body);
    } finally {
      setRunning(false);
    }
  }

  async function queueBackfill() {
    setBackfillRunning(true);
    setBackfillNote(null);
    try {
      const res = await fetch("/api/admin/semantic-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const body = (await res.json().catch(() => ({}))) as BackfillQueueResult;
      if (!res.ok) {
        setBackfillNote(body.error ?? "Backfill queue failed");
        return;
      }
      if (body.status) setBackfillStatus(body.status);
      else await refreshBackfillStatus();
      setBackfillNote(
        `Queued ${body.queued ?? 0} documents across ${body.spaceCount ?? 0} Spaces. ` +
          `Remaining ≈ ${body.remainingEstimate ?? "?"}. ` +
          (body.note ?? "Workers will process shortly — click again for the next batch.")
      );
    } finally {
      setBackfillRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-subtle bg-stone-50 p-4">
        <h2 className="text-sm font-semibold tracking-tight">
          Backfill all Spaces
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Queue Semantic Layer extraction for analyzed documents across every
          Space you can access. Runs in batches so you can click repeatedly
          until pending reaches zero. Requires{" "}
          <code className="text-xs">GUARDIAN_SEMANTIC_LAYER_ENABLED=true</code>.
        </p>
        {backfillStatus ? (
          <p className="mt-3 text-sm text-ink-muted">
            {backfillStatus.spaceCount} Spaces ·{" "}
            {backfillStatus.analyzedSources} analyzed sources ·{" "}
            <strong className="text-ink">{backfillStatus.semanticCompleted}</strong>{" "}
            completed · {backfillStatus.semanticPending} pending ·{" "}
            {backfillStatus.semanticProcessing} processing ·{" "}
            {backfillStatus.semanticFailed} failed ·{" "}
            {backfillStatus.semanticSkipped} skipped
            {backfillStatus.enabled === false
              ? " · flag off"
              : null}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Loading status…</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void queueBackfill()}
            disabled={backfillRunning}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {backfillRunning ? "Queuing…" : "Queue next backfill batch"}
          </button>
          <button
            type="button"
            onClick={() => void refreshBackfillStatus()}
            className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold hover:bg-white"
          >
            Refresh status
          </button>
        </div>
        {backfillNote ? (
          <p className="mt-3 text-sm text-ink-muted">{backfillNote}</p>
        ) : null}
      </section>

      <div>
        <label className="block text-sm font-semibold" htmlFor="semantic-lab-input">
          Paste text to analyze
        </label>
        <textarea
          id="semantic-lab-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="mt-2 w-full rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={running || !content.trim()}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {running ? "Analyzing…" : "Analyze Semantics"}
        </button>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
          />
          Persist to my semantic graph
        </label>
        <button
          type="button"
          onClick={() => setContent(EXAMPLE)}
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Load example
        </button>
      </div>

      {result?.error ? (
        <p className="text-sm text-red-700">{result.error}</p>
      ) : null}

      {result && !result.error ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Entities" data={result.entities} />
          <Section title="Relationships" data={result.relationships} />
          <Section title="Facts" data={result.facts} />
          <Section title="Evidence" data={result.evidence} />
          <Section title="Entity Resolution" data={result.entityResolution} />
          {result.warnings?.length ? (
            <Section title="Warnings" data={result.warnings} />
          ) : null}
          {result.ingest ? (
            <Section title="Ingest result" data={result.ingest} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border-subtle bg-stone-50 p-3 text-xs leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
