"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { buildGideonWelcomeView } from "@/lib/gideon-welcome/status";
import type {
  GideonWelcomeSpaceStats,
  GideonWelcomeViewModel,
} from "@/lib/gideon-welcome/types";
import {
  greetingFirstName,
  simpleHomeProfileCategory,
} from "@/lib/simple-home/helpers";
import { calendarDateInUserZone } from "@/lib/timezone";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import {
  buildQuestionsFromDocuments,
  orgsFromSpecialist,
  parseStoredSuggestedQuestions,
} from "@/lib/gideon/documentQuestions";

const EMPTY_STATS: GideonWelcomeSpaceStats = {
  category: "personal",
  profileType: null,
  leadsNeedFollowUp: 0,
  proposalsAwaitingResponse: 0,
  recentItemsCount: 0,
  upcomingAlertsCount: 0,
  openRequestCount: 0,
  hasAnyData: false,
  documentQuestions: [],
};

const AWAITING_PROPOSAL_STATUSES = new Set(["sent", "viewed"]);

function recentCutoffIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

async function fetchBusinessCounts(profileId: string): Promise<{
  leadsNeedFollowUp: number;
  proposalsAwaitingResponse: number;
}> {
  try {
    const [leadsRes, proposalsRes] = await Promise.all([
      fetch(`/api/leads?followUp=1&profileId=${encodeURIComponent(profileId)}`),
      fetch(`/api/proposals?profileId=${encodeURIComponent(profileId)}`),
    ]);

    let leadsNeedFollowUp = 0;
    if (leadsRes.ok) {
      const body = (await leadsRes.json()) as { leads?: unknown[] };
      leadsNeedFollowUp = Array.isArray(body.leads) ? body.leads.length : 0;
    }

    let proposalsAwaitingResponse = 0;
    if (proposalsRes.ok) {
      const body = (await proposalsRes.json()) as {
        proposals?: { status?: string }[];
      };
      proposalsAwaitingResponse = (body.proposals ?? []).filter((p) =>
        AWAITING_PROPOSAL_STATUSES.has(String(p.status ?? ""))
      ).length;
    }

    return { leadsNeedFollowUp, proposalsAwaitingResponse };
  } catch {
    return { leadsNeedFollowUp: 0, proposalsAwaitingResponse: 0 };
  }
}

export function useGideonWelcomeData() {
  const { active, profiles, accountName, timeZone, loading: profilesLoading } =
    useActiveProfile();
  const { progress, loading: onboardingLoading } = useOnboardingProgress();
  const [view, setView] = useState<GideonWelcomeViewModel | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const greetName = greetingFirstName(accountName, active?.display_name);
    const spaceName = active?.display_name?.trim() || null;

    if (!active) {
      setView(
        buildGideonWelcomeView({
          greetName,
          spaceName: null,
          isNewUser:
            progress.hasVault &&
            !progress.hasDocument &&
            !progress.hasDailyLog,
          stats: EMPTY_STATS,
          statusUnavailable: false,
        })
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setView(
        buildGideonWelcomeView({
          greetName,
          spaceName,
          isNewUser: false,
          stats: {
            ...EMPTY_STATS,
            category: simpleHomeProfileCategory(active.profile_type),
            profileType: active.profile_type,
          },
          statusUnavailable: true,
          profileId: active.id,
        })
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    const profileId = active.id;
    const today = calendarDateInUserZone(new Date(), timeZone);
    const recentCutoff = recentCutoffIso();
    const category = simpleHomeProfileCategory(active.profile_type);

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
            .select("id", { count: "exact", head: true })
            .in("profile_id", clientProfileIds)
            .in("status", ["open", "in_progress"])
        : null;

    try {
      const [
        docsTotalRes,
        logsTotalRes,
        chatsTotalRes,
        recentDocsRes,
        recentLogsRes,
        alertsRes,
        requestsRes,
        businessCounts,
        extractedRes,
        recentDocRowsRes,
      ] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId),
        supabase
          .from("daily_logs")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId),
        supabase
          .from("vault_chats")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .gte("created_at", recentCutoff),
        supabase
          .from("daily_logs")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .gte("created_at", recentCutoff),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .is("dismissed_at", null)
          .gte("due_date", today),
        requestsQuery ?? Promise.resolve({ count: 0, error: null }),
        category === "business"
          ? fetchBusinessCounts(profileId)
          : Promise.resolve({
              leadsNeedFollowUp: 0,
              proposalsAwaitingResponse: 0,
            }),
        supabase
          .from("extracted_data")
          .select(
            "document_id, document_type, title, summary, suggested_questions, specialist"
          )
          .eq("profile_id", profileId)
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase
          .from("documents")
          .select("id, file_name")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      let extractedRows = extractedRes.data ?? [];
      if (
        extractedRes.error &&
        /suggested_questions|schema cache|could not find/i.test(
          extractedRes.error.message
        )
      ) {
        const fallback = await supabase
          .from("extracted_data")
          .select("document_id, document_type, title, summary, specialist")
          .eq("profile_id", profileId)
          .order("updated_at", { ascending: false })
          .limit(8);
        extractedRows = fallback.data ?? [];
      }

      const docTotal = docsTotalRes.count ?? 0;
      const logTotal = logsTotalRes.count ?? 0;
      const chatTotal = chatsTotalRes.count ?? 0;
      const recentItemsCount =
        (recentDocsRes.count ?? 0) + (recentLogsRes.count ?? 0);
      const upcomingAlertsCount = alertsRes.count ?? 0;
      const openRequestCount = requestsRes.count ?? 0;

      const nameById = new Map(
        (recentDocRowsRes.data ?? []).map((d) => [
          String(d.id),
          String(d.file_name ?? ""),
        ])
      );
      let documentQuestions = buildQuestionsFromDocuments(
        extractedRows.map((row) => ({
          title: typeof row.title === "string" ? row.title : null,
          fileName: nameById.get(String(row.document_id)) ?? null,
          documentType:
            typeof row.document_type === "string" ? row.document_type : null,
          summary: typeof row.summary === "string" ? row.summary : null,
          organizations: orgsFromSpecialist(row.specialist),
          suggestedQuestions: parseStoredSuggestedQuestions(
            "suggested_questions" in row ? row.suggested_questions : null
          ),
        }))
      );

      // If analysis rows are missing, still seed from filenames.
      if (!documentQuestions.length && (recentDocRowsRes.data ?? []).length) {
        documentQuestions = buildQuestionsFromDocuments(
          (recentDocRowsRes.data ?? []).map((d) => ({
            fileName: String(d.file_name ?? ""),
          }))
        );
      }

      const hasSpaceData =
        docTotal +
          logTotal +
          chatTotal +
          upcomingAlertsCount +
          openRequestCount >
        0;
      const hasBusinessData =
        category === "business" &&
        (businessCounts.leadsNeedFollowUp > 0 ||
          businessCounts.proposalsAwaitingResponse > 0);

      const stats: GideonWelcomeSpaceStats = {
        category,
        profileType: active.profile_type,
        leadsNeedFollowUp: businessCounts.leadsNeedFollowUp,
        proposalsAwaitingResponse: businessCounts.proposalsAwaitingResponse,
        recentItemsCount,
        upcomingAlertsCount,
        openRequestCount,
        hasAnyData: hasSpaceData || hasBusinessData,
        documentQuestions,
      };

      const isNewUser =
        !progress.hasDocument &&
        !progress.hasDailyLog &&
        !progress.hasAskedGideon;

      setView(
        buildGideonWelcomeView({
          greetName,
          spaceName,
          isNewUser,
          stats,
          statusUnavailable: false,
          profileId,
        })
      );
    } catch {
      setView(
        buildGideonWelcomeView({
          greetName,
          spaceName,
          isNewUser: false,
          stats: {
            ...EMPTY_STATS,
            category,
            profileType: active.profile_type,
          },
          statusUnavailable: true,
          profileId,
        })
      );
    } finally {
      setLoading(false);
    }
  }, [active, profiles, accountName, timeZone, progress]);

  useEffect(() => {
    if (profilesLoading || onboardingLoading) return;
    void refresh();
  }, [profilesLoading, onboardingLoading, refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("guardian:profile-changed", onRefresh);
    window.addEventListener("guardian:alerts-updated", onRefresh);
    window.addEventListener("guardian:logs-updated", onRefresh);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("guardian:profile-changed", onRefresh);
      window.removeEventListener("guardian:alerts-updated", onRefresh);
      window.removeEventListener("guardian:logs-updated", onRefresh);
    };
  }, [refresh]);

  return {
    view,
    loading: profilesLoading || onboardingLoading || loading,
    refresh,
  };
}
