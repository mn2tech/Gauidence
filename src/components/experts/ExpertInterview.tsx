"use client";

import { useEffect, useState } from "react";

type InterviewQuestion = {
  id: string;
  category: string;
  difficulty: string;
  question: string;
};

type Props = {
  userExpertId: string;
};

export default function ExpertInterview({ userExpertId }: Props) {
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/experts/${userExpertId}/interview`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load interview questions.");
        setLoading(false);
        return;
      }
      setQuestions(data.questions ?? []);
      setLoading(false);
    }
    void load();
  }, [userExpertId]);

  async function startSession() {
    const res = await fetch(`/api/experts/${userExpertId}/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't start interview session.");
      return;
    }
    setSessionId(data.session.id);
    setIndex(0);
    setResponse("");
    setFeedback(null);
  }

  async function submitResponse() {
    if (!sessionId || !questions[index]) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/experts/${userExpertId}/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "respond",
        sessionId,
        questionId: questions[index].id,
        response,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't submit response.");
      return;
    }
    setFeedback(data.feedback);
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading interview mode…</p>;
  if (error && questions.length === 0) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!sessionId) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-xl font-semibold">Interview practice</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Practice open-ended questions one at a time and receive AI feedback after each response.
        </p>
        <button
          type="button"
          onClick={() => void startSession()}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Start interview
        </button>
      </div>
    );
  }

  const current = questions[index];
  if (!current) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-ink-muted">
        Interview complete.
        <button
          type="button"
          onClick={() => void startSession()}
          className="ml-3 rounded-full border border-stone-300 px-4 py-2 text-sm"
        >
          Restart
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs text-ink-muted">
          Question {index + 1} of {questions.length} · {current.category} · {current.difficulty}
        </p>
        <h2 className="mt-2 text-lg font-semibold">{current.question}</h2>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={!!feedback}
          rows={6}
          placeholder="Type your response"
          className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm"
        />
        {!feedback ? (
          <button
            type="button"
            disabled={!response.trim() || submitting}
            onClick={() => void submitResponse()}
            className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Getting feedback…" : "Submit response"}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-stone-50 p-4 text-sm whitespace-pre-wrap">
              {feedback}
            </div>
            <button
              type="button"
              onClick={() => {
                if (index < questions.length - 1) {
                  setIndex((v) => v + 1);
                  setResponse("");
                  setFeedback(null);
                } else {
                  setSessionId(null);
                  setIndex(0);
                  setResponse("");
                  setFeedback(null);
                }
              }}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              {index < questions.length - 1 ? "Next question" : "Finish"}
            </button>
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
