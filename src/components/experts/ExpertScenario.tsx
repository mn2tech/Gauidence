"use client";

import { useEffect, useState } from "react";
import { ExpertFictionalNotice } from "./ExpertSafetyNotice";

type Scenario = {
  id: string;
  title: string;
  difficulty: string;
  category: string;
  fictional: boolean;
  notice?: string;
  context: string;
  records?: Record<string, unknown> | Record<string, unknown>[];
  question: string;
  choices: string[];
};

type Props = {
  userExpertId: string;
  scenarioId: string;
};

function renderRecords(records?: Scenario["records"]) {
  if (!records) return null;
  if (Array.isArray(records)) {
    return (
      <div className="space-y-2">
        {records.map((record, index) => (
          <div key={index} className="rounded-xl bg-stone-50 p-4 text-sm">
            {Object.entries(record).map(([key, value]) => (
              <p key={key}>
                <span className="font-medium">{key}:</span> {String(value)}
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-stone-50 p-4 text-sm">
      {Object.entries(records).map(([key, value]) => (
        <p key={key}>
          <span className="font-medium">{key}:</span> {String(value)}
        </p>
      ))}
    </div>
  );
}

export default function ExpertScenario({ userExpertId, scenarioId }: Props) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    wasCorrect: boolean;
    explanation: string;
    learningPoints: string[];
    correctChoiceIndex: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/experts/${userExpertId}/scenario?scenarioId=${encodeURIComponent(scenarioId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load scenario.");
        setLoading(false);
        return;
      }
      setScenario(data.scenario);
      if (data.latestAttempt) {
        setSelected(data.latestAttempt.selected_choice_index);
        setSubmitted(true);
      }
      setLoading(false);
    }
    void load();
  }, [userExpertId, scenarioId]);

  async function submit() {
    if (!scenario || selected === null) return;
    const res = await fetch(`/api/experts/${userExpertId}/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId,
        selectedChoiceIndex: selected,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't submit scenario.");
      return;
    }
    setSubmitted(true);
    setResult({
      wasCorrect: data.wasCorrect,
      explanation: data.explanation,
      learningPoints: data.learningPoints,
      correctChoiceIndex: data.correctChoiceIndex,
    });
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading scenario…</p>;
  if (error || !scenario) {
    return <p className="text-sm text-red-600">{error ?? "Scenario not found."}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="rounded-full bg-stone-100 px-2.5 py-1">{scenario.difficulty}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1">{scenario.category}</span>
        </div>
        <h2 className="mt-3 text-xl font-semibold">{scenario.title}</h2>
        {scenario.fictional ? <div className="mt-4"><ExpertFictionalNotice notice={scenario.notice} /></div> : null}
        <p className="mt-4 text-sm text-ink-muted">{scenario.context}</p>
        {scenario.records ? <div className="mt-4">{renderRecords(scenario.records)}</div> : null}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h3 className="font-medium">{scenario.question}</h3>
        <div className="mt-4 space-y-2">
          {scenario.choices.map((choice, choiceIndex) => (
            <label
              key={choice}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                submitted && result?.correctChoiceIndex === choiceIndex
                  ? "border-emerald-300 bg-emerald-50"
                  : submitted && selected === choiceIndex && !result?.wasCorrect
                    ? "border-red-300 bg-red-50"
                    : "border-stone-200"
              }`}
            >
              <input
                type="radio"
                name="scenario-choice"
                disabled={submitted}
                checked={selected === choiceIndex}
                onChange={() => setSelected(choiceIndex)}
              />
              {choice}
            </label>
          ))}
        </div>

        {!submitted ? (
          <button
            type="button"
            disabled={selected === null}
            onClick={() => void submit()}
            className="mt-5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Submit answer
          </button>
        ) : result ? (
          <div className="mt-5 space-y-3 text-sm">
            <p className="font-medium">
              {result.wasCorrect ? "Correct" : "Incorrect"}
            </p>
            <p className="text-ink-muted">{result.explanation}</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-muted">
              {result.learningPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setSelected(null);
                setResult(null);
              }}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
            >
              Restart scenario
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
