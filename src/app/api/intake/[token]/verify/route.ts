import { NextResponse } from "next/server";
import {
  logIntakeAccess,
  lookupIntakeByToken,
  verifyIntakeCode,
} from "@/lib/intake/external";
import {
  createIntakeSession,
  setIntakeSessionCookie,
} from "@/lib/intake/session";
import { verifyIntakeCodeSchema } from "@/lib/intake/validators";
import { createSessionToken } from "@/lib/payroll/tokens";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await lookupIntakeByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = verifyIntakeCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid code." },
      { status: 400 }
    );
  }

  const { request: intakeRequest, admin } = lookup;
  const result = await verifyIntakeCode(
    admin,
    intakeRequest,
    parsed.data.code,
    clientIp(request)
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sessionToken = createSessionToken();
  const sessionValue = createIntakeSession(intakeRequest, sessionToken);
  await setIntakeSessionCookie(sessionValue);

  await logIntakeAccess(admin, {
    requestId: intakeRequest.id,
    action: "verified",
    recipientEmail: intakeRequest.recipient_email,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true, verified: true });
}
