import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

function escapeIlike(raw: string): string {
  return raw.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Lightweight vault context for Research: matching document names/summaries,
 * daily logs, and profile names — not full RAG (keeps research fast).
 */
export async function loadResearchVaultContext(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    query: string;
  }
): Promise<string> {
  const needle = escapeIlike(args.query);
  if (needle.length < 2) return "";

  const pattern = `%${needle}%`;
  const lower = needle.toLowerCase();

  const [docsRes, extractedRes, logsRes, profilesRes] = await Promise.all([
    supabase
      .from("documents")
      .select("file_name")
      .eq("profile_id", args.profileId)
      .ilike("file_name", pattern)
      .limit(8),
    supabase
      .from("extracted_data")
      .select("title, summary, document_type")
      .eq("profile_id", args.profileId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("daily_logs")
      .select("log_date, title, content")
      .eq("profile_id", args.profileId)
      .order("log_date", { ascending: false })
      .limit(40),
    supabase
      .from("guardian_profiles")
      .select("display_name, profile_type")
      .eq("id", args.profileId)
      .limit(1),
  ]);

  const parts: string[] = [];

  const docs = docsRes.data ?? [];
  if (docs.length > 0) {
    parts.push(
      `Matching document file names:\n${docs
        .map((d) => `- ${d.file_name}`)
        .join("\n")}`
    );
  }

  const extracted = (extractedRes.data ?? [])
    .filter((e) => {
      const hay = `${e.title ?? ""} ${e.summary ?? ""}`.toLowerCase();
      return hay.includes(lower);
    })
    .slice(0, 8);
  if (extracted.length > 0) {
    parts.push(
      `Matching analyses:\n${extracted
        .map((e) => {
          const title = e.title?.trim() || "(untitled)";
          const summary = (e.summary ?? "").trim().slice(0, 200);
          return `- ${title} (${e.document_type ?? "document"})${
            summary ? `: ${summary}` : ""
          }`;
        })
        .join("\n")}`
    );
  }

  const logs = (logsRes.data ?? [])
    .filter((l) => {
      const hay = `${l.title ?? ""} ${l.content ?? ""}`.toLowerCase();
      return hay.includes(lower);
    })
    .slice(0, 5);
  if (logs.length > 0) {
    parts.push(
      `Matching Daily Logs:\n${logs
        .map((l) => {
          const title = l.title?.trim();
          const snippet = (l.content ?? "").trim().slice(0, 160);
          return `- ${l.log_date}${title ? ` · ${title}` : ""}: ${snippet}`;
        })
        .join("\n")}`
    );
  }

  const profiles = profilesRes.data ?? [];
  if (profiles.length > 0) {
    parts.push(
      `Matching Guardian profiles:\n${profiles
        .map((p) => `- ${p.display_name} (${p.profile_type})`)
        .join("\n")}`
    );
  }

  return parts.join("\n\n");
}
