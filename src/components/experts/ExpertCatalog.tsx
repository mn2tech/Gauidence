"use client";

import { useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import type { UserExpert } from "@/lib/experts/expert-types";
import { useActiveProfile } from "@/components/ProfileProvider";
import ExpertCatalogCard from "./ExpertCatalogCard";
import ExpertInstallDialog from "./ExpertInstallDialog";

type Props = {
  initialExperts: ExpertCatalogItem[];
  initialInstallations: UserExpert[];
};

export default function ExpertCatalog({
  initialExperts,
  initialInstallations,
}: Props) {
  const { profiles } = useActiveProfile();
  const [experts] = useState(initialExperts);
  const [installations, setInstallations] = useState(initialInstallations);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedExpert, setSelectedExpert] = useState<ExpertCatalogItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = experts.filter((expert) => {
    const matchesCategory = category === "All" || expert.category === category;
    const haystack = `${expert.name} ${expert.description} ${expert.category}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const grouped = filtered.reduce<Record<string, ExpertCatalogItem[]>>((acc, expert) => {
    acc[expert.category] = acc[expert.category] ?? [];
    acc[expert.category].push(expert);
    return acc;
  }, {});

  async function handleInstall(profileId: string) {
    if (!selectedExpert) return;
    setError(null);
    const res = await fetch("/api/experts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expertId: selectedExpert.id, profileId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Installation failed.");
      return;
    }
    setInstallations((prev) => [...prev, data.installation]);
    setSelectedExpert(null);
    window.location.href = `/experts/${selectedExpert.id}?installation=${data.installation.id}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search experts"
          className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {["All", "Professional", "Learning", "Business", "Personal"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                category === item
                  ? "bg-brand text-white"
                  : "border border-stone-200 bg-white text-ink-muted"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-ink-muted">
          No experts match your search.
        </div>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <section key={group} className="space-y-4">
            <h2 className="text-lg font-semibold">{group}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((expert) => (
                <ExpertCatalogCard
                  key={expert.id}
                  expert={expert}
                  installations={installations.filter((i) => i.expert_id === expert.id)}
                  onInstall={() => setSelectedExpert(expert)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <ExpertInstallDialog
        expert={selectedExpert}
        profiles={profiles}
        open={!!selectedExpert}
        onClose={() => {
          setSelectedExpert(null);
          setError(null);
        }}
        onConfirm={handleInstall}
      />
    </div>
  );
}
