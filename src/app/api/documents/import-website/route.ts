import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { assertBillingQuota } from "@/lib/billing/quota";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { WEBSITE_IMPORT_MAX_PAGES } from "@/lib/vault/websiteCrawl";
import { importWebsiteToVault } from "@/lib/vault/websiteImport";

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
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let websiteUrl = "";
  let profileId = "";
  let maxPages = WEBSITE_IMPORT_MAX_PAGES;
  try {
    const body = (await request.json()) as {
      url?: string;
      websiteUrl?: string;
      profileId?: string;
      maxPages?: number;
    };
    websiteUrl = String(body.url ?? body.websiteUrl ?? "").trim();
    profileId = String(body.profileId ?? "").trim();
    if (typeof body.maxPages === "number" && Number.isFinite(body.maxPages)) {
      maxPages = Math.min(
        WEBSITE_IMPORT_MAX_PAGES,
        Math.max(1, Math.floor(body.maxPages))
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!websiteUrl) {
    return NextResponse.json({ error: "Enter a website URL." }, { status: 400 });
  }
  if (!profileId) {
    return NextResponse.json(
      { error: "Choose a Space to import the website into." },
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
      { error: "You don't have permission to add files to that Space." },
      { status: 403 }
    );
  }

  const quota = await assertBillingQuota(supabase, user.id, "analyze", user.email);
  if (!quota.ok) return quota.response;

  try {
    const result = await importWebsiteToVault(supabase, {
      userId: user.id,
      profileId: profile.id,
      storageOwnerId: profile.owner_user_id,
      websiteUrl,
      email: user.email,
      maxPages,
    });

    return NextResponse.json({
      ok: true,
      profileId: result.profileId,
      documentCount: result.documents.length,
      documents: result.documents,
      skipped: result.crawl.skipped,
      warnings: result.crawl.errors,
      seedUrl: result.crawl.seedUrl,
      origin: result.crawl.origin,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't import that website.";
    const status = /permission|don't have/i.test(message)
      ? 403
      : /valid|enter a website|http/i.test(message)
        ? 400
        : /storage limit/i.test(message)
          ? 429
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
