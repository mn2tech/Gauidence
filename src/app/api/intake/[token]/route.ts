import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  logIntakeAccess,
  lookupIntakeByToken,
} from "@/lib/intake/external";
import { verifyIntakeSession } from "@/lib/intake/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

function maskEmail(email: string): string {
  return email.replace(/(.{2}).*(@.*)/, "$1***$2");
}

/** Public intake link peek — metadata until email verified. */
export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await lookupIntakeByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const { request: intakeRequest, admin } = lookup;
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  await logIntakeAccess(admin, {
    requestId: intakeRequest.id,
    action: "link_opened",
    recipientEmail: intakeRequest.recipient_email,
    ipAddress: ip,
    userAgent: ua,
  });

  const verified = await verifyIntakeSession(intakeRequest.id);

  if (!verified && intakeRequest.require_email_verification) {
    return NextResponse.json({
      requiresVerification: true,
      recipientEmail: maskEmail(intakeRequest.recipient_email),
      recipientName: intakeRequest.recipient_name,
      purpose: intakeRequest.purpose,
    });
  }

  const now = new Date().toISOString();
  if (!intakeRequest.opened_at) {
    await admin
      .from("contractor_intake_requests")
      .update({
        opened_at: now,
        last_accessed_at: now,
        status:
          intakeRequest.status === "pending" ? "opened" : intakeRequest.status,
      })
      .eq("id", intakeRequest.id);
  }

  const { data: business } = await admin
    .from("guardian_profiles")
    .select("display_name, company_name, business_legal_name")
    .eq("id", intakeRequest.profile_id)
    .maybeSingle();

  const { data: employee } = await admin
    .from("guardian_profiles")
    .select("display_name")
    .eq("id", intakeRequest.employee_profile_id)
    .maybeSingle();

  const biz = business as {
    display_name?: string;
    company_name?: string;
    business_legal_name?: string;
  } | null;

  const businessName =
    biz?.business_legal_name?.trim() ||
    biz?.company_name?.trim() ||
    biz?.display_name?.trim() ||
    "Your organization";

  return NextResponse.json({
    verified: true,
    businessName,
    recipientName:
      intakeRequest.recipient_name ||
      (employee as { display_name?: string } | null)?.display_name ||
      null,
    purpose: intakeRequest.purpose,
    optionalMessage: intakeRequest.optional_message,
    expiresAt: intakeRequest.expires_at,
  });
}
