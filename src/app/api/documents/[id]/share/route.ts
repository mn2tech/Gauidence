import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";

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

type Ctx = { params: Promise<{ id: string }> };

const SHARE_SELECT =
  "id, document_id, token, expires_at, revoked_at, include_file, created_at";

/** List active shares for a document. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: documentId } = await ctx.params;

  const { data: doc } = await supabase
    .from("documents")
    .select("id, profile_id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data: shares, error } = await supabase
    .from("document_shares")
    .select(SHARE_SELECT)
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't load shares. Run the latest database migration if needed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ shares: shares ?? [] });
}

/** Create a share link. Body: { expiresInDays?: 1|7|30, includeFile?: boolean } */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: documentId } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }

  const daysRaw = Number(body.expiresInDays ?? 7);
  const expiresInDays = [1, 7, 30].includes(daysRaw) ? daysRaw : 7;
  const includeFile = body.includeFile === true;

  const { data: doc } = await supabase
    .from("documents")
    .select("id, profile_id, user_id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const owned = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    doc.profile_id
  );
  if (!owned) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expiresInDays);

  const { data: share, error } = await supabase
    .from("document_shares")
    .insert({
      document_id: documentId,
      user_id: user.id,
      profile_id: doc.profile_id,
      token,
      expires_at: expiresAt.toISOString(),
      include_file: includeFile,
    })
    .select(SHARE_SELECT)
    .single();

  if (error || !share) {
    return NextResponse.json(
      {
        error:
          "Couldn't create share link. Run migration 0017 (document_shares) in Supabase if you haven't yet.",
      },
      { status: 502 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);

  return NextResponse.json(
    {
      share,
      url: origin ? `${origin}/share/${share.token}` : `/share/${share.token}`,
    },
    { status: 201 }
  );
}

/** Revoke a share. Body: { shareId: string } */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: documentId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const shareId = typeof body.shareId === "string" ? body.shareId : "";
  if (!shareId) {
    return NextResponse.json({ error: "Missing shareId." }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("document_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Couldn't revoke share." },
      { status: 502 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
