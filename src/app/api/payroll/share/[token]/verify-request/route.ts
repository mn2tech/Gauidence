import { NextResponse } from "next/server";
import { sendPayrollVerificationEmail } from "@/lib/email";
import {
  logExternalAccess,
  lookupShareByToken,
  requestVerificationCode,
} from "@/lib/payroll/external";
import { getBusinessName } from "@/lib/payroll/server";

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
  const lookup = await lookupShareByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const { share, admin } = lookup;

  if (!share.require_email_verification) {
    return NextResponse.json({ error: "Verification not required." }, { status: 400 });
  }

  const result = await requestVerificationCode(admin, share, clientIp(request));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }

  const businessName = await getBusinessName(admin, share.profile_id);
  const sent = await sendPayrollVerificationEmail({
    to: share.recipient_email,
    code: result.code,
    businessName,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Couldn't send verification code. Try again later." },
      { status: 502 }
    );
  }

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "code_requested",
    recipientEmail: share.recipient_email,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
