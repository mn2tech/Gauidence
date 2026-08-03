"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionTimelineItem } from "@/components/GideonActionTimeline";
import type { ProactiveSuggestionItem } from "@/components/GideonProactiveSuggestions";
import type { WorkspaceTimelineItem } from "@/components/GideonWorkspaceTimeline";

export type CommandCenterData = {
  profileId: string;
  profileName: string;
  todayAlerts: { id: string; title: string; dueDate: string }[];
  recentUploads: { id: string; fileName: string; createdAt: string }[];
  openRequests: { id: string; title: string; profileName: string | null }[];
  recentClientLogs: {
    id: string;
    profileId: string;
    profileName: string | null;
    preview: string;
    createdAt: string;
  }[];
  actionTimeline: ActionTimelineItem[];
  proactiveSuggestions: ProactiveSuggestionItem[];
  workspaceTimeline: WorkspaceTimelineItem[];
};

const EMPTY: CommandCenterData = {
  profileId: "",
  profileName: "",
  todayAlerts: [],
  recentUploads: [],
  openRequests: [],
  recentClientLogs: [],
  actionTimeline: [],
  proactiveSuggestions: [],
  workspaceTimeline: [],
};

export function useCommandCenterData() {
  const [data, setData] = useState<CommandCenterData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/command-center/summary");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load command center.");
      }
      const body = (await res.json()) as CommandCenterData;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load command center.");
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("guardian:profile-changed", onFocus);
    window.addEventListener("guardian:alerts-updated", onFocus);
    window.addEventListener("guardian:logs-updated", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("guardian:profile-changed", onFocus);
      window.removeEventListener("guardian:alerts-updated", onFocus);
      window.removeEventListener("guardian:logs-updated", onFocus);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
