import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";
import { assignExpertByEmail } from "@/lib/experts/assign-expert";

export const runtime = "nodejs";

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
  if (!isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Couldn't assign expert. Check SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const targetEmail =
    typeof body.targetEmail === "string" ? body.targetEmail.trim() : "";
  const expertId = typeof body.expertId === "string" ? body.expertId.trim() : "";
  const profileId =
    typeof body.profileId === "string" && body.profileId.trim()
      ? body.profileId.trim()
      : null;

  if (!targetEmail || !expertId) {
    return NextResponse.json(
      { error: "targetEmail and expertId are required." },
      { status: 400 }
    );
  }

  const result = await assignExpertByEmail({
    admin,
    targetEmail,
    expertId,
    profileId,
    assignedByUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      result.userExpertId
        ? { error: result.error, userExpertId: result.userExpertId }
        : { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      installation: result.installation,
      created: result.created,
      message: result.created
        ? "Expert assigned successfully."
        : "Expert was already installed for that profile.",
    },
    { status: result.created ? 201 : 200 }
  );
}
