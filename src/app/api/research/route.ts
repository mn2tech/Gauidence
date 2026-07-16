import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import {
  ANALYSIS_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  formatWebResultsForPrompt,
  isWebSearchConfigured,
  searchWeb,
} from "@/lib/research/webSearch";
import {
  normalizeSubjectKind,
  RESEARCH_SYSTEM,
  sanitizeResearchQuery,
} from "@/lib/research/prompt";
import { loadResearchVaultContext } from "@/lib/research/vaultContext";

export const runtime = "nodejs";
export const maxDuration = 60;

const RESEARCH_LIMIT_PER_HOUR = 30;

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

/** Research a company, person, or topic with live web search + vault context. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "AI research isn't set up yet. The site owner needs to add an Anthropic API key.",
      },
      { status: 503 }
    );
  }

  if (!isWebSearchConfigured()) {
    return NextResponse.json(
      {
        error:
          "Web research isn't set up yet. Add TAVILY_API_KEY on this deployment (tavily.com).",
        code: "missing_tavily",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = sanitizeResearchQuery(body.query);
  if (!query) {
    return NextResponse.json(
      { error: "Enter a company, person, or topic to research." },
      { status: 400 }
    );
  }

  const subjectKind = normalizeSubjectKind(body.subjectKind);
  const includeVault = body.includeVault !== false;

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "Create a person or space first — open the dashboard and choose who you're helping.",
      },
      { status: 400 }
    );
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", hourAgo);
  if (countError) {
    return NextResponse.json(
      { error: "We couldn't start research. Please try again." },
      { status: 502 }
    );
  }
  if ((count ?? 0) >= RESEARCH_LIMIT_PER_HOUR) {
    return NextResponse.json(
      {
        error:
          "You've reached the research limit for now. Try again in about an hour.",
      },
      { status: 429 }
    );
  }

  const { error: eventError } = await supabase.from("chat_events").insert({
    user_id: user.id,
  });
  if (eventError) {
    return NextResponse.json(
      { error: "We couldn't start research. Please try again." },
      { status: 502 }
    );
  }

  try {
    const searchQuery =
      subjectKind === "company"
        ? `${query} company business`
        : subjectKind === "person"
          ? `${query} professional biography`
          : query;

    const [web, vaultContext] = await Promise.all([
      searchWeb(searchQuery, { maxResults: 6 }),
      includeVault
        ? loadResearchVaultContext(supabase, {
            userId: user.id,
            profileId: active.id,
            query,
          })
        : Promise.resolve(""),
    ]);

    const personCaution =
      subjectKind === "person"
        ? "Subject kind: person. Stick to public professional/business information only."
        : subjectKind === "company"
          ? "Subject kind: company / organization."
          : "Subject kind: general topic.";

    const system = `${RESEARCH_SYSTEM}

Active vault: ${active.display_name} (${active.profile_type}).
${personCaution}
Research query: ${query}

--- WEB SEARCH RESULTS ---
${formatWebResultsForPrompt(web.results)}
--- END WEB SEARCH RESULTS ---

--- GUARDIAN VAULT CONTEXT ---
${vaultContext.trim() || "(none matching this query in the active vault)"}
--- END GUARDIAN VAULT CONTEXT ---`;

    const client = createLlmClient();
    const brief = await runChatCompletion(client, {
      system,
      model: ANALYSIS_MODEL,
      maxTokens: 2500,
      messages: [
        {
          role: "user",
          content: `Write a Research brief for: ${query}`,
        },
      ],
    });

    return NextResponse.json({
      query,
      subjectKind,
      profileId: active.id,
      profileName: active.display_name,
      brief,
      sources: web.results,
      vaultContextUsed: Boolean(vaultContext.trim()),
      provider: web.provider,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Research failed. Please try again.";
    console.error("Research failed:", message.slice(0, 240));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
