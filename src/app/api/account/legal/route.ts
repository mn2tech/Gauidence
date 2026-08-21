import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

export const runtime = "nodejs";

type Body = {
  termsAccepted?: boolean;
  privacyAcknowledged?: boolean;
  aiNoticeAcknowledged?: boolean;
};

/**
 * Persist legal / AI notice acknowledgments for the signed-in user.
 * Existing users without rows are not locked out; this records consent when given.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, string> = { updated_at: now };

  if (body.termsAccepted) {
    patch.terms_accepted_at = now;
    patch.terms_version = LEGAL_VERSIONS.terms;
  }
  if (body.privacyAcknowledged) {
    patch.privacy_acknowledged_at = now;
    patch.privacy_version = LEGAL_VERSIONS.privacy;
  }
  if (body.aiNoticeAcknowledged) {
    patch.ai_notice_acknowledged_at = now;
    patch.ai_notice_version = LEGAL_VERSIONS.aiDisclaimer;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (error) {
    const missing =
      /terms_|privacy_|ai_notice/i.test(error.message) &&
      /does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Legal consent columns are not set up yet — run migration 0092_legal_consent.sql."
          : "Couldn't save acknowledgment.",
      },
      { status: missing ? 503 : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    versions: {
      terms: patch.terms_version ?? null,
      privacy: patch.privacy_version ?? null,
      aiNotice: patch.ai_notice_version ?? null,
    },
  });
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "terms_accepted_at, terms_version, privacy_acknowledged_at, privacy_version, ai_notice_acknowledged_at, ai_notice_version"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        current: LEGAL_VERSIONS,
        termsAcceptedAt: null,
        privacyAcknowledgedAt: null,
        aiNoticeAcknowledgedAt: null,
        needsAiNotice: true,
        migrationPending: true,
      },
      { status: 200 }
    );
  }

  const aiAcked = Boolean(data?.ai_notice_acknowledged_at);
  const aiCurrent =
    data?.ai_notice_version === LEGAL_VERSIONS.aiDisclaimer;

  return NextResponse.json({
    current: LEGAL_VERSIONS,
    termsAcceptedAt: data?.terms_accepted_at ?? null,
    termsVersion: data?.terms_version ?? null,
    privacyAcknowledgedAt: data?.privacy_acknowledged_at ?? null,
    privacyVersion: data?.privacy_version ?? null,
    aiNoticeAcknowledgedAt: data?.ai_notice_acknowledged_at ?? null,
    aiNoticeVersion: data?.ai_notice_version ?? null,
    needsAiNotice: !aiAcked || !aiCurrent,
  });
}
