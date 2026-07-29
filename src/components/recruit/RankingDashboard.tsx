"use client";

import { useMemo, useState } from "react";
import {
  RECOMMENDATION_LABELS,
  type CandidateWithDetails,
  type RecommendationStatus,
} from "@/lib/recruit/types";

type Props = {
  candidates: CandidateWithDetails[];
  onSelectCandidate: (id: string) => void;
  onRankChange: (candidateId: string, rank: number) => void;
};

type SortKey = "score" | "name" | "experience" | "rank";

export default function RankingDashboard({
  candidates,
  onSelectCandidate,
  onRankChange,
}: Props) {
  const [scoreMin, setScoreMin] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [skillFilter, setSkillFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const analyzed = candidates.filter((c) => c.score);

  const filtered = useMemo(() => {
    let list = [...analyzed];
    list = list.filter((c) => {
      const score = c.score?.overridden_score ?? c.score?.match_score ?? 0;
      if (score < scoreMin) return false;
      if (
        statusFilter !== "all" &&
        c.score?.recommendation_status !== statusFilter
      )
        return false;
      if (skillFilter) {
        const skills = c.extraction?.technical_skills ?? [];
        if (
          !skills.some((s) =>
            s.toLowerCase().includes(skillFilter.toLowerCase())
          )
        )
          return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortKey === "rank") {
        return (a.manual_rank ?? 9999) - (b.manual_rank ?? 9999);
      }
      if (sortKey === "name") {
        const na = a.display_name ?? "";
        const nb = b.display_name ?? "";
        return na.localeCompare(nb);
      }
      if (sortKey === "experience") {
        return (
          (b.extraction?.relevant_experience_years ?? 0) -
          (a.extraction?.relevant_experience_years ?? 0)
        );
      }
      const sa = a.score?.overridden_score ?? a.score?.match_score ?? 0;
      const sb = b.score?.overridden_score ?? b.score?.match_score ?? 0;
      return sb - sa;
    });

    return list;
  }, [analyzed, scoreMin, statusFilter, skillFilter, sortKey]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Candidate Ranking</h2>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs font-medium">Min score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreMin}
            onChange={(e) => setScoreMin(parseInt(e.target.value, 10) || 0)}
            className="ml-2 w-16 rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {(Object.keys(RECOMMENDATION_LABELS) as RecommendationStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {RECOMMENDATION_LABELS[s]}
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium">Skills</label>
          <input
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            placeholder="Filter by skill"
            className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
          >
            <option value="score">Score</option>
            <option value="rank">Manual rank</option>
            <option value="name">Name</option>
            <option value="experience">Experience</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left">
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Candidate</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Exp.</th>
              <th className="px-3 py-2">Skills %</th>
              <th className="px-3 py-2">Missing</th>
              <th className="px-3 py-2">Review</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const score =
                c.score?.overridden_score ?? c.score?.match_score ?? 0;
              return (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-stone-100 hover:bg-stone-50"
                  onClick={() => onSelectCandidate(c.id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={c.manual_rank ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (v > 0) onRankChange(c.id, v);
                      }}
                      className="w-12 rounded border border-stone-200 px-1 py-0.5 text-center text-xs"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {c.display_name ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2">{score.toFixed(1)}</td>
                  <td className="px-3 py-2">
                    {c.score
                      ? RECOMMENDATION_LABELS[c.score.recommendation_status]
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.extraction?.relevant_experience_years ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.score?.required_skill_match_pct != null
                      ? `${c.score.required_skill_match_pct}%`
                      : "—"}
                  </td>
                  <td className="max-w-[150px] truncate px-3 py-2 text-xs text-ink-muted">
                    {(c.score?.missing_requirements ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 capitalize">{c.review_status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No analyzed candidates match your filters.
        </p>
      ) : null}
    </div>
  );
}
