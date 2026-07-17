import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { VAULT_PASTE_MAX_CHARS } from "@/lib/vault/pastedText";

export const runtime = "nodejs";
export const maxDuration = 120;

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

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ]/g, "_").trim() || "research-brief";
}

/** Save a Research brief into the active vault as a text document. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = String(body.query ?? "").trim().slice(0, 300);
  const brief = String(body.brief ?? "").trim();
  const profileId = String(body.profileId ?? "").trim();
  const sources = Array.isArray(body.sources)
    ? (body.sources as { title?: string; url?: string }[])
    : [];

  if (!query || !brief) {
    return NextResponse.json(
      { error: "Nothing to save — run Research first." },
      { status: 400 }
    );
  }
  if (!profileId) {
    return NextResponse.json(
      { error: "Missing vault profile for this brief." },
      { status: 400 }
    );
  }

  const profile = await requireEditableGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "That vault isn't available on your account." },
      { status: 403 }
    );
  }

  const sourceLines = sources
    .map((s, i) => {
      const title = String(s.title ?? "Source").trim() || "Source";
      const url = String(s.url ?? "").trim();
      return url ? `[${i + 1}] ${title}\n${url}` : `[${i + 1}] ${title}`;
    })
    .filter(Boolean)
    .join("\n\n");

  let content = [
    `Title: Research — ${query}`,
    sources[0]?.url ? `Source: ${String(sources[0].url).trim()}` : null,
    "",
    brief,
    "",
    "--- Sources ---",
    sourceLines || "(none)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  if (content.length > VAULT_PASTE_MAX_CHARS) {
    content = `${content.slice(0, VAULT_PASTE_MAX_CHARS)}\n\n[truncated]`;
  }

  const fileName = `Research - ${safeFileName(query)}.txt`;
  const path = `${profile.owner_user_id}/${profile.id}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
  const bytes = Buffer.from(content, "utf8");

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, {
      contentType: "text/plain",
      upsert: false,
    });

  if (uploadError) {
    console.error("Research save upload failed:", uploadError.message);
    return NextResponse.json(
      {
        error: uploadError.message?.includes("Bucket not found")
          ? "Document storage isn't set up yet on this project — the site owner needs to run the latest database migration."
          : `Upload failed: ${uploadError.message || "please try again."}`,
      },
      { status: 502 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      profile_id: profile.id,
      file_name: fileName,
      file_path: path,
      mime_type: "text/plain",
      size_bytes: bytes.byteLength,
      analysis_status: "uploaded",
    })
    .select("id, file_name")
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from("documents").remove([path]);
    console.error(
      "Research save insert failed:",
      insertError?.code,
      insertError?.message,
      insertError?.details,
      insertError?.hint
    );
    return NextResponse.json(
      {
        error: insertError?.message
          ? `Couldn't save the document record: ${insertError.message}`
          : "We couldn't save the document record. Please try again.",
        code: insertError?.code,
      },
      { status: 502 }
    );
  }

  let analyzed = false;
  let analysisError: string | undefined;
  try {
    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie") ?? "";
    const analyzeRes = await fetch(`${origin}/api/documents/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        documentId: inserted.id,
        timeZone: GUARDIAN_TIME_ZONE,
      }),
    });
    if (analyzeRes.ok) {
      analyzed = true;
    } else {
      const analyzeBody = (await analyzeRes.json().catch(() => ({}))) as {
        error?: string;
      };
      analysisError =
        analyzeBody.error ??
        "Analysis failed. The brief is in your vault — retry from Documents.";
    }
  } catch {
    analysisError =
      "Analysis didn't finish. The brief is in your vault — retry from Documents.";
  }

  return NextResponse.json({
    documentId: inserted.id,
    fileName: inserted.file_name,
    profileName: profile.display_name,
    analyzed,
    analysisError,
  });
}
