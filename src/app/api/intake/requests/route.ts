import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { createIntakeRequestRecord } from "@/lib/intake/createRequest";
import { logIntakeAccess, getIntakeBusinessName } from "@/lib/intake/external";
import { listIntakeRequests, getEmployeeForIntake } from "@/lib/intake/server";
import { createIntakeRequestSchema } from "@/lib/intake/validators";
import { sendIntakeRequestEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

async function authorizeBusinessAccess(
  auth: Authed,
  businessProfileId: string,
  employeeProfileId: string
) {
  const employee = await getEmployeeForIntake(
    auth.supabase,
    employeeProfileId,
    businessProfileId
  );
  if (!employee) {
    return {
      error: NextResponse.json({ error: "Employee not found." }, { status: 404 }),
    };
  }

  const profile = await requireEditableGuardianProfile(
    auth.supabase,
    auth.user.id,
    businessProfileId
  );
  if (!profile) {
    return {
      error: NextResponse.json({ error: "Access denied." }, { status: 403 }),
    };
  }

  return { employee };
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;

  const employeeProfileId = new URL(request.url).searchParams.get(
    "employeeProfileId"
  );
  const businessProfileId = new URL(request.url).searchParams.get("profileId");

  if (!employeeProfileId || !businessProfileId) {
    return NextResponse.json(
      { error: "employeeProfileId and profileId are required." },
      { status: 400 }
    );
  }

  const access = await authorizeBusinessAccess(
    auth,
    businessProfileId,
    employeeProfileId
  );
  if (access.error) return access.error;

  const requests = await listIntakeRequests(auth.supabase, employeeProfileId);
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createIntakeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const businessProfileId = new URL(request.url).searchParams.get("profileId");
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "profileId query parameter is required." },
      { status: 400 }
    );
  }

  const access = await authorizeBusinessAccess(
    auth,
    businessProfileId,
    parsed.data.employeeProfileId
  );
  if (access.error) return access.error;

  const employee = access.employee!;

  const created = await createIntakeRequestRecord(auth.supabase, {
    profileId: businessProfileId,
    employeeProfileId: parsed.data.employeeProfileId,
    recipientEmail: parsed.data.recipientEmail,
    recipientName: parsed.data.recipientName,
    purpose: parsed.data.purpose,
    requireEmailVerification: parsed.data.requireEmailVerification,
    optionalMessage: parsed.data.optionalMessage,
    createdBy: auth.user.id,
  });

  if (!created) {
    return NextResponse.json(
      { error: "Couldn't create secure intake link." },
      { status: 502 }
    );
  }

  let emailSent = false;
  if (parsed.data.sendEmail) {
    const admin = createAdminClient();
    const businessName = admin
      ? await getIntakeBusinessName(admin, businessProfileId)
      : "Your organization";

    emailSent = await sendIntakeRequestEmail({
      to: parsed.data.recipientEmail,
      recipientName: parsed.data.recipientName ?? employee.display_name,
      businessName,
      intakeUrl: created.url,
      expiresAt: created.expiresAt,
      optionalMessage: parsed.data.optionalMessage,
    });

    if (admin) {
      await logIntakeAccess(admin, {
        requestId: created.requestId,
        action: "email_sent",
        recipientEmail: parsed.data.recipientEmail,
        actorUserId: auth.user.id,
      });
    }
  }

  const requests = await listIntakeRequests(
    auth.supabase,
    parsed.data.employeeProfileId
  );

  return NextResponse.json({
    ok: true,
    intakeUrl: created.url,
    expiresAt: created.expiresAt,
    emailSent,
    requests,
  });
}
