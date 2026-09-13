import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";

const DAILY_RECAP_INTENT =
  /^\s*(?:what happened|what did i do|give me (?:a )?recap|recap|summarize my day)(?:\s+(?:on|for))?\s+(today|yesterday)\s*[?.!]*\s*$/i;

export function wantsDailyRecap(question: string): boolean {
  return DAILY_RECAP_INTENT.test(question);
}

export function resolveDailyRecapDate(
  question: string,
  now: Date,
  timeZone: string
): string | null {
  const match = question.match(DAILY_RECAP_INTENT);
  if (!match) return null;
  const today = calendarDateInUserZone(now, timeZone);
  if (match[1]?.toLowerCase() === "today") return today;
  const yesterday = new Date(`${today}T12:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

type RecapDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  title?: string | null;
  summary?: string | null;
  document_type?: string | null;
};

function onLocalDate(instant: string, date: string, timeZone: string): boolean {
  const parsed = new Date(instant);
  return !Number.isNaN(parsed.getTime()) &&
    calendarDateInUserZone(parsed, timeZone) === date;
}

function isBusinessCard(document: RecapDocument): boolean {
  if (!document.mime_type.startsWith("image/")) return false;
  return /\bbusiness[\s_-]*card\b/i.test(
    [document.file_name, document.title, document.summary, document.document_type]
      .filter(Boolean)
      .join(" ")
  );
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export async function buildDailyRecap(
  supabase: SupabaseClient,
  args: {
    question: string;
    userId: string;
    profileIds: string[];
    profileNames?: Record<string, string>;
    timeZone: string;
    now?: Date;
  }
): Promise<string | null> {
  const date = resolveDailyRecapDate(
    args.question,
    args.now ?? new Date(),
    args.timeZone
  );
  if (!date || args.profileIds.length === 0) return null;

  const [documentsResult, logsResult, eventsResult, leadsResult] = await Promise.all([
    supabase
      .from("documents")
      .select("id,profile_id,file_name,mime_type,created_at")
      .in("profile_id", args.profileIds)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("daily_logs")
      .select("id,profile_id,title,content,log_date")
      .in("profile_id", args.profileIds)
      .eq("log_date", date)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("guardian_events")
      .select("id,space_id,event_type,title,summary,occurred_at,status")
      .eq("user_id", args.userId)
      .in("space_id", args.profileIds)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("business_leads")
      .select("id,business_profile_id,company_name,contact_name,created_at")
      .in("business_profile_id", args.profileIds)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const documentRows = (documentsResult.data ?? []).filter((document) =>
    onLocalDate(document.created_at, date, args.timeZone)
  );
  const documentIds = documentRows.map((document) => document.id);
  const { data: analyses } = documentIds.length
    ? await supabase
        .from("extracted_data")
        .select("document_id,title,summary,document_type")
        .in("document_id", documentIds)
    : { data: [] };
  const analysesByDocument = new Map(
    (analyses ?? []).map((analysis) => [analysis.document_id, analysis])
  );
  const documents: RecapDocument[] = documentRows.map((document) => ({
    ...document,
    ...analysesByDocument.get(document.id),
  }));
  const cards = documents.filter(isBusinessCard);
  const otherDocuments = documents.filter((document) => !isBusinessCard(document));
  const logs = logsResult.data ?? [];
  const events = (eventsResult.data ?? []).filter(
    (event) =>
      !["document_added", "daily_log_entry"].includes(event.event_type) &&
      onLocalDate(event.occurred_at, date, args.timeZone)
  );
  const leads = (leadsResult.data ?? []).filter((lead) =>
    onLocalDate(lead.created_at, date, args.timeZone)
  );

  const lines = [`Here’s what Guardian recorded for ${displayDate(date)}:`];
  if (cards.length) {
    lines.push(
      "",
      `Business cards uploaded (${cards.length})`,
      ...cards.slice(0, 10).map((card) => `• ${card.title?.trim() || card.file_name}`)
    );
  }
  if (otherDocuments.length) {
    lines.push(
      "",
      `Other documents uploaded (${otherDocuments.length})`,
      ...otherDocuments
        .slice(0, 8)
        .map((document) => `• ${document.title?.trim() || document.file_name}`)
    );
  }
  if (logs.length) {
    lines.push(
      "",
      `Daily Log entries (${logs.length})`,
      ...logs.slice(0, 8).map((log) => `• ${log.title?.trim() || log.content.slice(0, 100)}`)
    );
  }
  if (leads.length) {
    lines.push(
      "",
      `Leads added (${leads.length})`,
      ...leads.slice(0, 10).map((lead) =>
        `• ${lead.contact_name?.trim() || lead.company_name?.trim() || "Unnamed lead"}`
      )
    );
  }
  if (events.length) {
    lines.push(
      "",
      `Activity and events (${events.length})`,
      ...events.slice(0, 10).map((event) => `• ${event.title}`)
    );
  }

  if (
    cards.length === 0 &&
    otherDocuments.length === 0 &&
    logs.length === 0 &&
    leads.length === 0 &&
    events.length === 0
  ) {
    lines.push("", "No uploads, Daily Logs, new leads, or recorded activity were found.");
  }
  return lines.join("\n");
}
