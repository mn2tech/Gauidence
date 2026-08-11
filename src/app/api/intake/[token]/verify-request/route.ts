import { NextResponse } from "next/server";
import {
  getIntakeBusinessName,
  logIntakeAccess,
  lookupIntakeByToken,
  requestIntakeVerificationCode,
} from "@/lib/intake/external";
import { sendIntakeVerificationEmail } from "@/lib/email";

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

  const { request: intakeRequest, admin } = lookup;

  if (!intakeRequest.require_email_verification) {
    return NextResponse.json(
      { error: "Verification not required." },
      { status: 400 }
    );
  }

  const result = await requestIntakeVerificationCode(
    admin,
    intakeRequest,
    clientIp(request)
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }

  const businessName = await getIntakeBusinessName(admin, intakeRequest.profile_id);
  const sent = await sendIntakeVerificationEmail({
    to: intakeRequest.recipient_email,
    code: result.code,
    businessName,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Couldn't send verification code. Try again later." },
      { status: 502 }
    );
  }

  await logIntakeAccess(admin, {
    requestId: intakeRequest.id,
    action: "code_requested",
    recipientEmail: intakeRequest.recipient_email,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
