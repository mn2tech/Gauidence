"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ExpertGlossaryItem } from "@/lib/experts/expert-schema";

type Props = {
  expertId: string;
  userExpertId: string;
  glossary: ExpertGlossaryItem[];
};

export default function ExpertGlossary({ expertId, userExpertId, glossary }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(() => {
    return ["All", ...new Set(glossary.map((item) => item.category))];
  }, [glossary]);

  const filtered = glossary
    .filter((item) => category === "All" || item.category === category)
    .filter((item) => {
      const haystack = `${item.term} ${item.definition}`.toLowerCase();
      return !query.trim() || haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => a.term.localeCompare(b.term));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search glossary"
          className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm sm:max-w-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-ink-muted">
          No glossary terms match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <article
              key={item.term}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{item.term}</h3>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-ink-muted">
                  {item.category}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{item.definition}</p>
              {item.relatedTopicIds.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {item.relatedTopicIds.map((topicId) => (
                    <Link
                      key={topicId}
                      href={`/experts/${expertId}/learn?installation=${userExpertId}&topic=${topicId}`}
                      className="rounded-full border border-stone-200 px-2.5 py-1 text-brand hover:underline"
                    >
                      Topic: {topicId}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
