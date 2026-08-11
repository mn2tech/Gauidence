import { NextResponse } from "next/server";
import { lookupIntakeByToken } from "@/lib/intake/external";
import { processIntakeSubmission } from "@/lib/intake/processSubmission";
import { verifyIntakeSession } from "@/lib/intake/session";
import { notifyIntakeSubmitted } from "@/lib/intake/notify";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

function formString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await lookupIntakeByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const { request: intakeRequest, admin } = lookup;

  if (intakeRequest.require_email_verification) {
    const verified = await verifyIntakeSession(intakeRequest.id);
    if (!verified) {
      return NextResponse.json(
        { error: "Verify your email before submitting." },
        { status: 403 }
      );
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  let ssnRaw: string | null = null;
  let file: File | null = null;
  let legalName: string | null = null;
  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  let locationAddress: string | null = null;
  let employmentKind: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    legalName = formString(formData, "legalName");
    contactEmail = formString(formData, "email");
    contactPhone = formString(formData, "phone");
    locationAddress = formString(formData, "address");
    employmentKind = formString(formData, "employmentKind");
    const ssnField = formData.get("ssn");
    if (typeof ssnField === "string" && ssnField.trim()) {
      ssnRaw = ssnField.trim();
    }
    const fileField = formData.get("file");
    if (fileField instanceof File && fileField.size > 0) {
      file = fileField;
    }
  } else {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (typeof body.legalName === "string") legalName = body.legalName;
    if (typeof body.email === "string") contactEmail = body.email;
    if (typeof body.phone === "string") contactPhone = body.phone;
    if (typeof body.address === "string") locationAddress = body.address;
    if (typeof body.employmentKind === "string") employmentKind = body.employmentKind;
    if (typeof body.ssn === "string" && body.ssn.trim()) {
      ssnRaw = body.ssn.trim();
    }
  }

  const result = await processIntakeSubmission({
    request: intakeRequest,
    admin,
    legalName,
    contactEmail,
    contactPhone,
    locationAddress,
    employmentKind,
    ssnRaw,
    file,
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 }
    );
  }

  await notifyIntakeSubmitted(admin, {
    businessProfileId: intakeRequest.profile_id,
    employeeProfileId: intakeRequest.employee_profile_id,
    recipientName: legalName ?? intakeRequest.recipient_name,
    requestId: intakeRequest.id,
  });

  return NextResponse.json({ ok: true, submitted: true });
}
