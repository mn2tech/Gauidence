"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/ProfileProvider";
import { calendarDateInUserZone } from "@/lib/timezone";
import {
  formatActivityWhen,
  readRecentVaultIds,
  simpleHomeProfileCategory,
  type SimpleHomeActivityItem,
  type SimpleHomeProfileCategory,
} from "@/lib/simple-home/helpers";
import {
  documentsHref,
  dailyLogHref,
  DOCUMENTS_PATH,
} from "@/lib/routes";
import {
  topLevelProfiles,
  isOrgStyleProfile,
  type GuardianProfile,
} from "@/lib/profiles/types";

type TodayAlert = {
  id: string;
  title: string;
  dueDate: string;
};

type TodayDocument = {
  id: string;
  fileName: string;
  createdAt: string;
};

type TodayRequest = {
  id: string;
  title: string;
  profileName?: string | null;
};

export type SimpleHomeData = {
  category: SimpleHomeProfileCategory;
  todayAlerts: TodayAlert[];
  todayDocuments: TodayDocument[];
  openRequestCount: number;
  openRequests: TodayRequest[];
  recentVaults: GuardianProfile[];
  recentActivity: SimpleHomeActivityItem[];
  pendingCount: number;
};

const EMPTY: SimpleHomeData = {
  category: "personal",
  todayAlerts: [],
  todayDocuments: [],
  openRequestCount: 0,
  openRequests: [],
  recentVaults: [],
  recentActivity: [],
  pendingCount: 0,
};

export function useSimpleHomeData() {
  const { active, profiles, timeZone, loading: profilesLoading } =
    useActiveProfile();
  const [data, setData] = useState<SimpleHomeData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!active || profiles.length === 0) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    const category = simpleHomeProfileCategory(active.profile_type);
    const today = calendarDateInUserZone(new Date(), timeZone);
    const profileId = active.id;

    const clientProfileIds =
      isOrgStyleProfile(active.profile_type) && active.profile_type !== "client"
        ? profiles
            .filter(
              (p) =>
                p.parent_profile_id === active.id && p.profile_type === "client"
            )
            .map((p) => p.id)
        : active.profile_type === "client"
          ? [active.id]
          : [];

    const requestsQuery =
      clientProfileIds.length > 0
        ? supabase
            .from("client_requests")
            .select("id, title, profile_id, status, updated_at")
            .in("profile_id", clientProfileIds)
            .in("status", ["open", "in_progress"])
            .order("updated_at", { ascending: false })
            .limit(5)
        : null;

    const clientLogsQuery =
      clientProfileIds.length > 0
        ? supabase
            .from("daily_logs")
            .select("id, profile_id, title, content, created_at")
            .in("profile_id", clientProfileIds)
            .order("created_at", { ascending: false })
            .limit(5)
        : null;

    const [alertsRes, docsRes, logsRes, chatsRes, profilesRes, requestsRes, clientLogsRes] =
      await Promise.all([
        supabase
          .from("alerts")
          .select("id, title, due_date")
          .eq("profile_id", profileId)
          .is("dismissed_at", null)
          .gte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5),
        supabase
          .from("documents")
          .select("id, file_name, created_at")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("daily_logs")
          .select("id, title, created_at")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("vault_chats")
          .select("id, title, updated_at")
          .eq("profile_id", profileId)
          .order("updated_at", { ascending: false })
          .limit(3),
        supabase
          .from("guardian_profiles")
          .select("id, display_name, profile_type, updated_at")
          .order("updated_at", { ascending: false })
          .limit(3),
        requestsQuery ?? Promise.resolve({ data: null, error: null }),
        clientLogsQuery ?? Promise.resolve({ data: null, error: null }),
      ]);

    const todayAlerts =
      (
        alertsRes.data as
          | { id: string; title: string; due_date: string }[]
          | null
      )?.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
      })) ?? [];

    const todayDocuments =
      (docsRes.data as { id: string; file_name: string; created_at: string }[] | null)?.map(
        (row) => ({
          id: row.id,
          fileName: row.file_name,
          createdAt: row.created_at,
        })
      ) ?? [];

    const activity: SimpleHomeActivityItem[] = [];

    for (const row of docsRes.data ?? []) {
      activity.push({
        id: `doc-${row.id}`,
        kind: "document",
        title: `Document uploaded: ${row.file_name}`,
        occurredAt: row.created_at,
        href: `${DOCUMENTS_PATH}&documentId=${row.id}`,
      });
    }

    for (const row of logsRes.data ?? []) {
      activity.push({
        id: `log-${row.id}`,
        kind: "note",
        title: `Note created: ${row.title?.trim() || "Daily log"}`,
        occurredAt: row.created_at,
        href: `${dailyLogHref(profileId)}&logId=${row.id}`,
      });
    }

    for (const row of profilesRes.data ?? []) {
      if (row.id === profileId) continue;
      activity.push({
        id: `vault-${row.id}`,
        kind: "vault",
        title: `Vault updated: ${row.display_name}`,
        occurredAt: row.updated_at,
        href: documentsHref(row.id),
      });
    }

    for (const row of chatsRes.data ?? []) {
      activity.push({
        id: `chat-${row.id}`,
        kind: "gideon",
        title: `Gideon analysis: ${row.title?.trim() || "Conversation"}`,
        occurredAt: row.updated_at,
        href: `/ask?chatId=${row.id}`,
      });
    }

    const openRequests =
      (
        requestsRes.data as
          | {
              id: string;
              title: string;
              profile_id: string;
              status: string;
              updated_at: string;
            }[]
          | null
      )?.map((row) => ({
        id: row.id,
        title: row.title,
        profileName:
          profiles.find((p) => p.id === row.profile_id)?.display_name ?? null,
      })) ?? [];

    const openRequestCount = openRequests.length;

    for (const row of requestsRes.data ?? []) {
      activity.push({
        id: `request-${row.id}`,
        kind: "note",
        title: `Request: ${row.title}`,
        occurredAt: row.updated_at,
        href: `/requests?id=${row.id}`,
      });
    }

    for (const row of clientLogsRes.data ?? []) {
      const profileName =
        profiles.find((p) => p.id === row.profile_id)?.display_name ?? "Client";
      const preview =
        (row.title as string | null)?.trim() ||
        String(row.content ?? "")
          .trim()
          .split(/\n/)[0]
          ?.trim()
          .slice(0, 60) ||
        "Daily log";
      activity.push({
        id: `client-log-${row.id}`,
        kind: "note",
        title: `Client log (${profileName}): ${preview}`,
        occurredAt: row.created_at,
        href: `${dailyLogHref(String(row.profile_id))}&logId=${row.id}`,
      });
    }

    activity.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

    const recentIds = readRecentVaultIds();
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const recentVaults: GuardianProfile[] = [];
    for (const id of recentIds) {
      const profile = profileById.get(id);
      if (profile) recentVaults.push(profile);
      if (recentVaults.length >= 5) break;
    }
    if (recentVaults.length < 3) {
      for (const profile of topLevelProfiles(profiles)) {
        if (recentVaults.some((p) => p.id === profile.id)) continue;
        recentVaults.push(profile);
        if (recentVaults.length >= 5) break;
      }
    }
    if (!recentVaults.some((p) => p.id === active.id)) {
      recentVaults.unshift(active);
    }

    setData({
      category,
      todayAlerts,
      todayDocuments,
      openRequestCount,
      openRequests,
      recentVaults: recentVaults.slice(0, 5),
      recentActivity: activity.slice(0, 6),
      pendingCount: todayAlerts.length,
    });
    setLoading(false);
  }, [active, profiles, timeZone]);

  useEffect(() => {
    if (profilesLoading) return;
    void refresh();
  }, [profilesLoading, refresh]);

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

  return { data, loading: profilesLoading || loading, refresh };
}
