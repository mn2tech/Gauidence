"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, MessageCircle, NotebookPen, Sparkles, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { GuardianProfile } from "@/lib/profiles/types";
import { askGideonContextLabel, profileContainerName } from "@/lib/profiles/types";
import { clientsOf, employeesOf } from "@/lib/profiles/types";

type Props = {
  profile: GuardianProfile;
  allProfiles: GuardianProfile[];
};

type OverviewStats = {
  documents: number;
  memories: number;
  people: number;
  projects: number;
};

export default function SpaceOverview({ profile, allProfiles }: Props) {
  const [stats, setStats] = useState<OverviewStats>({
    documents: 0,
    memories: 0,
    people: 0,
    projects: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      if (!supabase) return;
      setLoading(true);
      const [docsRes, logsRes] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profile.id),
        supabase
          .from("daily_logs")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profile.id),
      ]);
      if (cancelled) return;
      const people =
        employeesOf(allProfiles, profile.id).length +
        clientsOf(allProfiles, profile.id).length;
      setStats({
        documents: docsRes.count ?? 0,
        memories: logsRes.count ?? 0,
        people,
        projects: clientsOf(allProfiles, profile.id).length,
      });
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profile.id, allProfiles]);

  const cards = [
    { label: "Knowledge", value: stats.documents, suffix: "documents", icon: FileText },
    { label: "Memories", value: stats.memories, suffix: "entries", icon: NotebookPen },
    { label: "People", value: stats.people, suffix: "", icon: Users },
    { label: "Projects", value: stats.projects, suffix: "", icon: Sparkles },
  ];

  return (
    <div
      id={`overview-${profile.id}`}
      className="scroll-mt-36 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {profileContainerName(profile)}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Guardian&apos;s overview of what lives here.
          </p>
        </div>
        <Link
          href="/ask"
          className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {askGideonContextLabel(profile).replace("Ask Gideon about ", "Ask about ")}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Icon className="h-3.5 w-3.5" />
                {card.label}
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {loading ? "—" : card.value}
              </p>
              {card.suffix ? (
                <p className="text-[11px] text-ink-muted">{card.suffix}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
