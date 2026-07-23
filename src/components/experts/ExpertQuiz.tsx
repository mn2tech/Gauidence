"use client";

import { useEffect, useState } from "react";

type QuizQuestion = {
  id: string;
  type: "multiple-choice" | "true-false";
  question: string;
  options: string[];
};

type Quiz = {
  id: string;
  title: string;
  description: string;
  passingScore: number;
  questions: QuizQuestion[];
};

type Attempt = {
  score: number;
  completed_at: string;
};

type Props = {
  userExpertId: string;
  quizId: string;
};

export default function ExpertQuiz({ userExpertId, quizId }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    graded: { explanation: string; wasCorrect: boolean }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(
        `/api/experts/${userExpertId}/quiz?quizId=${encodeURIComponent(quizId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load quiz.");
        setLoading(false);
        return;
      }
      setQuiz(data.quiz);
      setAttempts(data.attempts ?? []);
      setAnswers(new Array(data.quiz.questions.length).fill(-1));
      setLoading(false);
    }
    void load();
  }, [userExpertId, quizId]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading quiz…</p>;
  }
  if (error || !quiz) {
    return <p className="text-sm text-red-600">{error ?? "Quiz not found."}</p>;
  }

  const bestScore = attempts.reduce((max, attempt) => Math.max(max, attempt.score), 0);
  const current = quiz.questions[index];

  async function submit() {
    const res = await fetch(`/api/experts/${userExpertId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId, answers }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't submit quiz.");
      return;
    }
    setResult({
      score: data.attempt.score,
      passed: data.passed,
      graded: data.graded,
    });
    setAttempts((prev) => [data.attempt, ...prev]);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Quiz results</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Score: {result.score}% · {result.passed ? "Passed" : "Not passed"} · Passing score:{" "}
            {quiz.passingScore}%
          </p>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setIndex(0);
              setAnswers(new Array(quiz.questions.length).fill(-1));
            }}
            className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Retry quiz
          </button>
        </div>
        <div className="space-y-3">
          {result.graded.map((item, i) => (
            <div key={quiz.questions[i].id} className="rounded-xl border border-stone-200 p-4 text-sm">
              <p className="font-medium">{quiz.questions[i].question}</p>
              <p className="mt-2 text-ink-muted">{item.explanation}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-xl font-semibold">{quiz.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{quiz.description}</p>
        <p className="mt-2 text-xs text-ink-muted">
          Best score: {bestScore}% · Passing score: {quiz.passingScore}%
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs text-ink-muted">
          Question {index + 1} of {quiz.questions.length}
        </p>
        <h3 className="mt-2 font-medium">{current.question}</h3>
        <div className="mt-4 space-y-2">
          {current.options.map((option, optionIndex) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm"
            >
              <input
                type="radio"
                name={current.id}
                checked={answers[index] === optionIndex}
                onChange={() =>
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[index] = optionIndex;
                    return next;
                  })
                }
              />
              {option}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((v) => v - 1)}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm"
          >
            Previous
          </button>
          {index < quiz.questions.length - 1 ? (
            <button
              type="button"
              disabled={answers[index] < 0}
              onClick={() => setIndex((v) => v + 1)}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={answers.some((value) => value < 0)}
              onClick={() => void submit()}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              Submit quiz
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
