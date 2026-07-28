import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";
import {
  listExpertEntitlements,
  revokeExpertAccess,
} from "@/lib/experts/entitlements";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Sign-in isn't configured on this deployment." },
        { status: 503 }
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "You need to be signed in." }, { status: 401 }),
    };
  }
  if (!isPlatformAdmin(user.email)) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "Couldn't access entitlements. Check SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 }
      ),
    };
  }

  return { admin };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const expertId = searchParams.get("expertId") ?? undefined;
  const email = searchParams.get("email") ?? undefined;

  const entitlements = await listExpertEntitlements(auth.admin!, {
    expertId,
    email,
  });

  return NextResponse.json({ entitlements });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const expertId = typeof body.expertId === "string" ? body.expertId.trim() : "";

  if (!userId || !expertId) {
    return NextResponse.json(
      { error: "userId and expertId are required." },
      { status: 400 }
    );
  }

  const result = await revokeExpertAccess(auth.admin!, { userId, expertId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    message:
      result.installationsRemoved > 0
        ? `Access revoked and ${result.installationsRemoved} installation(s) removed.`
        : "Access revoked.",
    installationsRemoved: result.installationsRemoved,
  });
}
