import { NextResponse } from "next/server";
import {
  logExternalAccess,
  lookupShareByToken,
  verifyCode,
} from "@/lib/payroll/external";
import {
  createShareSession,
  setShareSessionCookie,
} from "@/lib/payroll/session";
import { createSessionToken } from "@/lib/payroll/tokens";
import { verifyCodeSchema } from "@/lib/payroll/validators";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid code." },
      { status: 400 }
    );
  }

  const { share, admin } = lookup;
  const result = await verifyCode(admin, share, parsed.data.code, clientIp(request));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sessionToken = createSessionToken();
  const sessionValue = createShareSession(share, sessionToken);
  await setShareSessionCookie(sessionValue);

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "verification_completed",
    recipientEmail: share.recipient_email,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true, verified: true });
}
