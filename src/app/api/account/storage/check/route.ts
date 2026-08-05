import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertStorageQuota } from "@/lib/billing/storage";

export const runtime = "nodejs";

/** Pre-flight check before uploading bytes into a vault storage folder. */
export async function POST(request: Request) {
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

  let additionalBytes = 0;
  let storageOwnerId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body.additionalBytes === "number" && Number.isFinite(body.additionalBytes)) {
      additionalBytes = Math.max(0, Math.floor(body.additionalBytes));
    }
    if (typeof body.storageOwnerId === "string" && body.storageOwnerId.trim()) {
      storageOwnerId = body.storageOwnerId.trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const accountId = storageOwnerId ?? user.id;
  const quota = await assertStorageQuota(supabase, {
    accountId,
    additionalBytes,
    email: user.email,
  });
  if (!quota.ok) return quota.response;

  return NextResponse.json({ ok: true, ...quota.snapshot });
}
