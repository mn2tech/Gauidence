import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  buildIlikePattern,
  buildProfilePath,
  hrefForResult,
  sanitizeSearchQuery,
  scoreMatch,
  snippetAroundMatch,
  sortAndCapResults,
  type SearchResult,
} from "@/lib/search";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
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
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

type ProfileRow = {
  id: string;
  display_name: string;
  parent_profile_id: string | null;
  profile_type: string;
  relationship: string | null;
  organization_name: string | null;
  business_legal_name: string | null;
  school_name: string | null;
  job_title: string | null;
  department: string | null;
  description: string | null;
  updated_at: string;
};

/** Account-wide vault search across people, logs, documents, and Gideon chats. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const query = sanitizeSearchQuery(url.searchParams.get("q"));
  if (!query) {
    return NextResponse.json(
      { error: "Enter at least 2 characters to search." },
      { status: 400 }
    );
  }

  const pattern = buildIlikePattern(query);
  const lower = query.toLowerCase();

  const { data: allProfiles, error: profilesError } = await supabase
    .from("guardian_profiles")
    .select(
      "id, display_name, parent_profile_id, profile_type, relationship, organization_name, business_legal_name, school_name, job_title, department, description, updated_at"
    )
    .eq("owner_user_id", user.id)
    .order("display_name", { ascending: true });

  if (profilesError) {
    return NextResponse.json(
      { error: "Couldn't search your vaults." },
      { status: 502 }
    );
  }

  const profiles = (allProfiles ?? []) as ProfileRow[];
  const pathFor = (profileId: string) => buildProfilePath(profiles, profileId);

  const [
    logsRes,
    docsRes,
    extractedRes,
    chatsRes,
    messagesRes,
  ] = await Promise.all([
    supabase
      .from("daily_logs")
      .select(
        "id, profile_id, log_date, title, content, category, tags, updated_at"
      )
      .eq("owner_user_id", user.id)
      .or(
        `title.ilike.${pattern},content.ilike.${pattern},category.ilike.${pattern}`
      )
      .order("log_date", { ascending: false })
      .limit(40),
    supabase
      .from("documents")
      .select(
        "id, profile_id, file_name, category, analysis_status, created_at"
      )
      .eq("user_id", user.id)
      .or(`file_name.ilike.${pattern},category.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("extracted_data")
      .select(
        "document_id, profile_id, title, summary, document_type, facts, updated_at"
      )
      .eq("user_id", user.id)
      .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("vault_chats")
      .select("id, profile_id, title, updated_at")
      .eq("user_id", user.id)
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("vault_chat_messages")
      .select("id, chat_id, content, role, created_at")
      .eq("user_id", user.id)
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const results: SearchResult[] = [];

  // Profiles (filter in memory — all owned profiles already loaded)
  for (const p of profiles) {
    const hay = [
      p.display_name,
      p.relationship,
      p.organization_name,
      p.business_legal_name,
      p.school_name,
      p.job_title,
      p.department,
      p.description,
      p.profile_type,
    ]
      .filter(Boolean)
      .join(" ");
    if (!hay.toLowerCase().includes(lower)) continue;
    const title = p.display_name.trim() || "Vault";
    results.push({
      kind: "profile",
      id: p.id,
      profileId: p.id,
      title,
      snippet: snippetAroundMatch(hay, query, 120),
      profilePath: pathFor(p.id),
      occurredAt: p.updated_at,
      href: hrefForResult({ kind: "profile", id: p.id, profileId: p.id }),
      score: scoreMatch({ query, title, body: hay }),
    });
  }

  // Daily logs — also match tags client-side from a secondary pass if needed
  for (const log of logsRes.data ?? []) {
    const title = (log.title?.trim() || log.content.slice(0, 48).trim() || "Daily Log").replace(
      /\s+/g,
      " "
    );
    const body = [log.title, log.content, log.category, ...(log.tags ?? [])]
      .filter(Boolean)
      .join(" ");
    // Tag-only matches: if PostgREST or() missed tags, skip unless already matched
    if (!body.toLowerCase().includes(lower)) continue;
    results.push({
      kind: "daily_log",
      id: log.id,
      profileId: log.profile_id,
      title,
      snippet: snippetAroundMatch(log.content || title, query),
      profilePath: pathFor(log.profile_id),
      occurredAt: log.log_date,
      href: hrefForResult({
        kind: "daily_log",
        id: log.id,
        profileId: log.profile_id,
      }),
      score: scoreMatch({ query, title, body }),
    });
  }

  // Also find logs whose tags match but title/content didn't (small extra query)
  if (!(logsRes.error)) {
    const { data: tagLogs } = await supabase
      .from("daily_logs")
      .select(
        "id, profile_id, log_date, title, content, category, tags, updated_at"
      )
      .eq("owner_user_id", user.id)
      .contains("tags", [query])
      .limit(20);
    const seen = new Set(results.filter((r) => r.kind === "daily_log").map((r) => r.id));
    for (const log of tagLogs ?? []) {
      if (seen.has(log.id)) continue;
      const title =
        log.title?.trim() ||
        log.content.slice(0, 48).trim() ||
        "Daily Log";
      results.push({
        kind: "daily_log",
        id: log.id,
        profileId: log.profile_id,
        title,
        snippet: snippetAroundMatch(
          `Tag: ${(log.tags ?? []).join(", ")} — ${log.content}`,
          query
        ),
        profilePath: pathFor(log.profile_id),
        occurredAt: log.log_date,
        href: hrefForResult({
          kind: "daily_log",
          id: log.id,
          profileId: log.profile_id,
        }),
        score: scoreMatch({
          query,
          title,
          body: (log.tags ?? []).join(" "),
        }),
      });
    }
  }

  const docById = new Map(
    (docsRes.data ?? []).map((d) => [d.id, d] as const)
  );

  for (const doc of docsRes.data ?? []) {
    const title = doc.file_name;
    const body = [doc.file_name, doc.category].filter(Boolean).join(" ");
    results.push({
      kind: "document",
      id: doc.id,
      profileId: doc.profile_id,
      title,
      snippet: snippetAroundMatch(body, query),
      profilePath: pathFor(doc.profile_id),
      occurredAt: doc.created_at,
      href: hrefForResult({
        kind: "document",
        id: doc.id,
        profileId: doc.profile_id,
      }),
      score: scoreMatch({ query, title, body }),
    });
  }

  for (const ex of extractedRes.data ?? []) {
    if (docById.has(ex.document_id)) {
      // Already have a filename match — enrich score/snippet if analysis matches better
      continue;
    }
    const factsText =
      typeof ex.facts === "string"
        ? ex.facts
        : JSON.stringify(ex.facts ?? "");
    const title =
      ex.title?.trim() ||
      ex.document_type ||
      "Analyzed document";
    const body = [ex.title, ex.summary, ex.document_type, factsText]
      .filter(Boolean)
      .join(" ");
    if (!body.toLowerCase().includes(lower)) continue;
    results.push({
      kind: "document",
      id: ex.document_id,
      profileId: ex.profile_id,
      title,
      snippet: snippetAroundMatch(ex.summary || body, query),
      profilePath: pathFor(ex.profile_id),
      occurredAt: ex.updated_at,
      href: hrefForResult({
        kind: "document",
        id: ex.document_id,
        profileId: ex.profile_id,
      }),
      score: scoreMatch({ query, title, body }),
    });
  }

  // For extracted matches without doc row in docsRes, optionally fetch file names
  const missingDocIds = results
    .filter((r) => r.kind === "document")
    .map((r) => r.id)
    .filter((id) => !docById.has(id));
  if (missingDocIds.length > 0) {
    const { data: named } = await supabase
      .from("documents")
      .select("id, file_name")
      .eq("user_id", user.id)
      .in("id", missingDocIds);
    const names = new Map((named ?? []).map((d) => [d.id, d.file_name]));
    for (const r of results) {
      if (r.kind === "document" && names.has(r.id)) {
        r.title = names.get(r.id) ?? r.title;
      }
    }
  }

  const chatById = new Map(
    (chatsRes.data ?? []).map((c) => [c.id, c] as const)
  );

  for (const chat of chatsRes.data ?? []) {
    results.push({
      kind: "chat",
      id: chat.id,
      profileId: chat.profile_id,
      title: chat.title || "Ask Gideon",
      snippet: snippetAroundMatch(chat.title || "", query),
      profilePath: pathFor(chat.profile_id),
      occurredAt: chat.updated_at,
      href: hrefForResult({
        kind: "chat",
        id: chat.id,
        profileId: chat.profile_id,
      }),
      score: scoreMatch({ query, title: chat.title || "" }),
    });
  }

  // Message hits — resolve chat → profile
  const messageChatIds = [
    ...new Set((messagesRes.data ?? []).map((m) => m.chat_id)),
  ].filter((id) => !chatById.has(id));

  let extraChats: {
    id: string;
    profile_id: string;
    title: string;
    updated_at: string;
  }[] = [];
  if (messageChatIds.length > 0) {
    const { data } = await supabase
      .from("vault_chats")
      .select("id, profile_id, title, updated_at")
      .eq("user_id", user.id)
      .in("id", messageChatIds);
    extraChats = data ?? [];
    for (const c of extraChats) chatById.set(c.id, c);
  }

  const seenChats = new Set(
    results.filter((r) => r.kind === "chat").map((r) => r.id)
  );
  for (const msg of messagesRes.data ?? []) {
    const chat = chatById.get(msg.chat_id);
    if (!chat) continue;
    if (seenChats.has(chat.id)) {
      // Prefer keeping title match; optionally bump score if message is strong
      continue;
    }
    seenChats.add(chat.id);
    const title = chat.title || "Ask Gideon";
    results.push({
      kind: "chat",
      id: chat.id,
      profileId: chat.profile_id,
      title,
      snippet: snippetAroundMatch(msg.content, query),
      profilePath: pathFor(chat.profile_id),
      occurredAt: msg.created_at,
      href: hrefForResult({
        kind: "chat",
        id: chat.id,
        profileId: chat.profile_id,
      }),
      score: scoreMatch({
        query,
        title,
        body: msg.content,
      }),
    });
  }

  const capped = sortAndCapResults(results);

  return NextResponse.json({
    query,
    results: capped,
    counts: {
      profiles: capped.filter((r) => r.kind === "profile").length,
      dailyLogs: capped.filter((r) => r.kind === "daily_log").length,
      documents: capped.filter((r) => r.kind === "document").length,
      chats: capped.filter((r) => r.kind === "chat").length,
    },
  });
}
