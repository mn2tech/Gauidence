"use client";

import { useState } from "react";

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

export default function SemanticTestLabPanel() {
  const [content, setContent] = useState(EXAMPLE);
  const [persist, setPersist] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);

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

  return (
    <div className="space-y-6">
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
