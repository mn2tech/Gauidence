import { NextResponse } from "next/server";
import { sendPayrollOwnerNotification } from "@/lib/email";
import { buildPayrollReportData } from "@/lib/payroll/reportData";
import {
  generateCsvExport,
  generateExcelExport,
  generateHtmlExport,
} from "@/lib/payroll/export";
import {
  logExternalAccess,
  lookupShareByToken,
} from "@/lib/payroll/external";
import { verifyShareSession } from "@/lib/payroll/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await lookupShareByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const { share, admin } = lookup;
  const format = new URL(request.url).searchParams.get("format") ?? "csv";

  if (share.require_email_verification) {
    const verified = await verifyShareSession(share.id);
    if (!verified) {
      return NextResponse.json({ error: "Email verification required." }, { status: 401 });
    }
  }

  if (share.access_type === "view_only") {
    return NextResponse.json({ error: "Downloads are not permitted." }, { status: 403 });
  }

  if (!share.allowed_formats.includes(format as "csv" | "excel" | "pdf")) {
    return NextResponse.json({ error: "Format not allowed." }, { status: 403 });
  }

  const reportData = await buildPayrollReportData(admin, share.payroll_report_id);
  if (!reportData || reportData.report.status === "draft") {
    return NextResponse.json({ error: "Report not available." }, { status: 404 });
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;
  const actionMap = { csv: "csv_downloaded", excel: "excel_downloaded", pdf: "pdf_downloaded" } as const;
  const action = actionMap[format as keyof typeof actionMap] ?? "csv_downloaded";

  await admin
    .from("payroll_shares")
    .update({
      download_count: share.download_count + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq("id", share.id);

  await logExternalAccess(admin, {
    shareId: share.id,
    action,
    recipientEmail: share.recipient_email,
    ipAddress: ip,
    userAgent: ua,
  });

  const ownerAdmin = createAdminClient();
  if (ownerAdmin) {
    const { data: owner } = await ownerAdmin
      .from("payroll_reports")
      .select("created_by")
      .eq("id", share.payroll_report_id)
      .maybeSingle();
    if (owner?.created_by) {
      const { data: profile } = await ownerAdmin
        .from("profiles")
        .select("email")
        .eq("id", owner.created_by)
        .maybeSingle();
      if (profile?.email) {
        void sendPayrollOwnerNotification({
          to: profile.email,
          subject: "Payroll report downloaded",
          message: `Your payroll company (${share.recipient_email}) downloaded the ${format.toUpperCase()} report.`,
        });
      }
    }
  }

  const filename = `payroll-${reportData.report.pay_period_start}-${reportData.report.pay_period_end}`;

  if (format === "csv") {
    const csv = generateCsvExport(reportData);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  if (format === "excel") {
    const buffer = await generateExcelExport(reportData);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
      },
    });
  }

  const html = generateHtmlExport(reportData);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
      "Content-Disposition": `inline; filename="${filename}.html"`,
    },
  });
}
