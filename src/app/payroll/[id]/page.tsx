import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianPayroll } from "@/lib/features/payroll";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PayrollReportBuilder from "@/components/payroll/PayrollReportBuilder";
import { buildPayrollReportData } from "@/lib/payroll/reportData";
import { getPayrollReport, verifyProfileAccess } from "@/lib/payroll/server";
import { formatPayPeriod } from "@/lib/payroll/compute";

export const metadata: Metadata = {
  title: "Payroll Report — Guardian Payroll",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function PayrollReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessGuardianPayroll({ email: user.email })) {
    redirect("/dashboard");
  }

  const report = await getPayrollReport(supabase, id);
  if (!report) notFound();

  const allowed = await verifyProfileAccess(supabase, report.profile_id, user.id);
  if (!allowed) notFound();

  const data = await buildPayrollReportData(supabase, id);
  if (!data) notFound();

  const period = formatPayPeriod(report.pay_period_start, report.pay_period_end);

  return (
    <div className="flex min-h-screen flex-col bg-stone-950">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <p className="text-sm text-stone-500">
            <a href="/payroll" className="text-emerald-400 hover:text-emerald-300">
              ← Payroll
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold text-stone-100">{period}</h1>
          <p className="mt-1 text-sm text-stone-400">
            Review employee hours, approve, and share with your payroll company.
          </p>
          <div className="mt-8">
            <PayrollReportBuilder initialData={data} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
