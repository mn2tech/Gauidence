"use client";

import { RECOMMENDATION_LABELS, effectiveCandidateScore, type ReportData } from "@/lib/recruit/types";
import { RUBRIC_CATEGORIES } from "@/lib/recruit/rubric";
import RecruitSafetyNotice from "./RecruitSafetyNotice";

type Props = {
  report: ReportData;
  readOnly?: boolean;
};

export default function RecruitReportView({ report, readOnly = false }: Props) {
  const { job, rubric, shortlisted, candidates, generatedAt, recruiterName } =
    report;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted">Guardian Recruit · Shortlist Report</p>
        <h1 className="mt-1 text-2xl font-bold">{job.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Generated {new Date(generatedAt).toLocaleString()} by {recruiterName}
          {job.department ? ` · ${job.department}` : ""}
        </p>
      </div>

      <RecruitSafetyNotice />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase text-ink-muted">Reviewed</p>
          <p className="mt-1 text-2xl font-bold">{candidates.length}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase text-ink-muted">Shortlisted</p>
          <p className="mt-1 text-2xl font-bold">{shortlisted.length}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase text-ink-muted">Hiring manager</p>
          <p className="mt-1 text-sm font-semibold">
            {job.hiring_manager ?? "Not specified"}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Evaluation criteria</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left">
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {RUBRIC_CATEGORIES.map((c) => (
                <tr key={c.key} className="border-b border-stone-100">
                  <td className="px-4 py-2">{c.label}</td>
                  <td className="px-4 py-2">{rubric[c.key]}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Ranked shortlist</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Candidate</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Skill match</th>
              </tr>
            </thead>
            <tbody>
              {shortlisted.map((c, i) => {
                const score = effectiveCandidateScore(c.score);
                const name =
                  c.display_name ?? c.extraction?.candidate_name ?? "Unknown";
                return (
                  <tr key={c.id} className="border-b border-stone-100">
                    <td className="px-4 py-2">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{name}</td>
                    <td className="px-4 py-2">{score ?? "—"}</td>
                    <td className="px-4 py-2">
                      {c.score
                        ? RECOMMENDATION_LABELS[c.score.recommendation_status]
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {c.score?.required_skill_match_pct != null
                        ? `${c.score.required_skill_match_pct}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Candidate details</h2>
        {shortlisted.map((c, i) => {
          const score = effectiveCandidateScore(c.score);
          const name =
            c.display_name ?? c.extraction?.candidate_name ?? "Unknown";
          const summary =
            c.review?.edited_summary ?? c.score?.candidate_summary ?? "";
          return (
            <article
              key={c.id}
              className="rounded-xl border border-stone-200 p-5"
            >
              <h3 className="font-semibold">
                {i + 1}. {name}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                Score: {score ?? "N/A"}
                {c.score
                  ? ` · ${RECOMMENDATION_LABELS[c.score.recommendation_status]}`
                  : ""}
              </p>
              {summary ? (
                <p className="mt-3 text-sm leading-relaxed">{summary}</p>
              ) : null}
              {c.score?.strengths.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-green-700">Strengths</p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {c.score.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {c.score?.concerns.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-amber-700">Concerns</p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {c.score.concerns.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {c.score?.interview_questions.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium">Interview questions</p>
                  <ol className="mt-1 list-inside list-decimal text-sm">
                    {c.score.interview_questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {readOnly ? (
        <p className="text-xs text-ink-muted">
          This is a read-only hiring report shared via Guardian Recruit.
        </p>
      ) : null}
    </div>
  );
}
