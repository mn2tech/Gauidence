"use client";

import { useMemo, useState } from "react";
import { runAllTestLabCases, type TestLabRunResult } from "@/lib/personal-space/testLab";

const TABS = [
  "Onboarding",
  "Conversation",
  "Upload",
  "Extraction",
  "Entities",
  "Relationships",
  "Retrieval",
  "Response Depth",
  "Corrections",
  "Permissions",
  "Sources",
  "Knowledge Health",
  "Gideon Orchestration",
  "Context Grounding",
] as const;

export default function KnowledgeTestLabPanel() {
  const [results, setResults] = useState<TestLabRunResult[] | null>(null);
  const [passed, setPassed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Onboarding");
  const [running, setRunning] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!results) return [];
    return results.filter((r) => r.tab === tab);
  }, [results, tab]);

  function runAll() {
    setRunning(true);
    setResetNote(null);
    try {
      const out = runAllTestLabCases();
      setResults(out.results);
      setPassed(out.passed);
      setFailed(out.failed);
    } finally {
      setRunning(false);
    }
  }

  async function resetTestUser() {
    setResetNote(null);
    const res = await fetch("/api/admin/knowledge-test-lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-test-user" }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    setResetNote(
      body.message ??
        body.error ??
        (res.ok
          ? "Reset acknowledged — destructive tests never run on production user data."
          : "Reset failed")
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAll}
          disabled={running}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {running ? "Running…" : "Run All Tests"}
        </button>
        <button
          type="button"
          onClick={() => void resetTestUser()}
          className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
        >
          Reset Test User
        </button>
        {results ? (
          <p className="text-sm text-ink-muted">
            {passed} passed · {failed} failed · {results.length} total
          </p>
        ) : null}
      </div>

      {resetNote ? (
        <p className="text-sm text-ink-muted">{resetNote}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              tab === t
                ? "bg-brand text-white"
                : "bg-stone-100 text-ink-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!results ? (
        <p className="text-sm text-ink-muted">
          Run the suite to see pass/fail results for this tab. Tests execute
          against the in-memory Personal Space lab — never against production
          user data.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">No tests in this tab.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Test</th>
                <th className="px-3 py-2">Input</th>
                <th className="px-3 py-2">Expected</th>
                <th className="px-3 py-2">Actual</th>
                <th className="px-3 py-2">Pass</th>
                <th className="px-3 py-2">Sources</th>
                <th className="px-3 py-2">Entities</th>
                <th className="px-3 py-2">Rels</th>
                <th className="px-3 py-2">Depth</th>
                <th className="px-3 py-2">Orchestration</th>
                <th className="px-3 py-2">Why this context?</th>
                <th className="px-3 py-2">ms</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle align-top">
                  <td className="px-3 py-2 font-medium">
                    {r.id} {r.name}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{r.input}</td>
                  <td className="px-3 py-2 text-ink-muted">{r.expected}</td>
                  <td className="max-w-xs px-3 py-2 break-words">{r.actual}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.pass
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-red-600"
                      }
                    >
                      {r.pass ? "Pass" : "Fail"}
                    </span>
                    {r.errors?.length ? (
                      <p className="text-xs text-red-600">{r.errors.join("; ")}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(r.sources ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(r.entitiesCreated ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(r.relationshipsCreated ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">{r.responseDepth ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {r.orchestration ? (
                      <pre className="max-w-xs whitespace-pre-wrap break-words font-mono text-[10px]">
                        {JSON.stringify(r.orchestration, null, 0)}
                      </pre>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {r.groundingDebug ? (
                      <pre className="max-w-md max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                        {r.groundingDebug}
                      </pre>
                    ) : tab === "Context Grounding" ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{r.latencyMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
