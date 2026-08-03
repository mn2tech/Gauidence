import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import {
  listActionTimeline,
  startOfUtcDay,
} from "@/lib/actions/events";
import { isKnowledgeEngineEnabled } from "@/lib/features/knowledge-engine";
import {
  listProactiveSuggestions,
  listWorkspaceTimeline,
} from "@/lib/knowledge/queries";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { listGuardianProfiles } from "@/lib/profiles/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json({ error: "No active vault." }, { status: 404 });
  }

  const timeZone = await getUserTimeZone(supabase, user.id);
  const today = calendarDateInUserZone(new Date(), timeZone);
  const profileId = active.id;

  const profiles = await listGuardianProfiles(supabase, user.id);
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
          .select("id, profile_id, title, content, created_at, owner_user_id")
          .in("profile_id", clientProfileIds)
          .order("created_at", { ascending: false })
          .limit(5)
      : null;

  const intelligenceEnabled = isKnowledgeEngineEnabled();

  const [
    alertsRes,
    docsRes,
    actionTimeline,
    proactiveSuggestions,
    workspaceTimeline,
    requestsRes,
    clientLogsRes,
  ] = await Promise.all([
    supabase
      .from("alerts")
      .select("id, title, due_date")
      .eq("profile_id", profileId)
      .is("dismissed_at", null)
      .gte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(8),
    supabase
      .from("documents")
      .select("id, file_name, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(5),
    listActionTimeline(supabase, user.id, {
      since: startOfUtcDay(),
      limit: 10,
      profileId,
    }),
    intelligenceEnabled
      ? listProactiveSuggestions(supabase, user.id, {
          profileId,
          limit: 5,
        })
      : Promise.resolve([]),
    intelligenceEnabled
      ? listWorkspaceTimeline(supabase, user.id, {
          profileId,
          limit: 6,
        })
      : Promise.resolve([]),
    requestsQuery ?? Promise.resolve({ data: null, error: null }),
    clientLogsQuery ?? Promise.resolve({ data: null, error: null }),
  ]);

  const todayAlerts =
    (alertsRes.data as { id: string; title: string; due_date: string }[] | null)?.map(
      (row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
      })
    ) ?? [];

  const recentUploads =
    (docsRes.data as { id: string; file_name: string; created_at: string }[] | null)?.map(
      (row) => ({
        id: row.id,
        fileName: row.file_name,
        createdAt: row.created_at,
      })
    ) ?? [];

  const openRequests =
    (
      requestsRes.data as
        | { id: string; title: string; profile_id: string }[]
        | null
    )?.map((row) => ({
      id: row.id,
      title: row.title,
      profileName:
        profiles.find((p) => p.id === row.profile_id)?.display_name ?? null,
    })) ?? [];

  const recentClientLogs =
    (
      clientLogsRes.data as
        | {
            id: string;
            profile_id: string;
            title: string | null;
            content: string;
            created_at: string;
          }[]
        | null
    )?.map((row) => {
      const preview =
        row.title?.trim() ||
        row.content.trim().split(/\n/)[0]?.trim().slice(0, 80) ||
        "Daily Log";
      return {
        id: row.id,
        profileId: row.profile_id,
        profileName:
          profiles.find((p) => p.id === row.profile_id)?.display_name ?? null,
        preview,
        createdAt: row.created_at,
      };
    }) ?? [];

  return NextResponse.json({
    profileId,
    profileName: active.display_name,
    todayAlerts,
    recentUploads,
    openRequests,
    recentClientLogs,
    actionTimeline,
    proactiveSuggestions: intelligenceEnabled ? proactiveSuggestions : [],
    workspaceTimeline: intelligenceEnabled ? workspaceTimeline : [],
  });
}
