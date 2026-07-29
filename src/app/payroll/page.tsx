import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianPayroll } from "@/lib/features/payroll";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PayrollReportList from "@/components/payroll/PayrollReportList";
import { listPayrollReports, getBusinessName } from "@/lib/payroll/server";

export const metadata: Metadata = {
  title: "Guardian Payroll — Business Payroll Reports",
  description:
    "Prepare payroll reports, approve hours, and securely share with your payroll company.",
};

export default async function PayrollPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessGuardianPayroll({ email: user.email })) {
    redirect("/dashboard");
  }

  const { data: profiles } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type")
    .in("profile_type", ["business", "non_profit"]);

  const businessProfiles = (profiles ?? []).filter(
    (p) => p.profile_type === "business" || p.profile_type === "non_profit"
  );

  if (businessProfiles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-stone-950">
        <SiteHeader />
        <main className="flex-1">
          <section className="mx-auto max-w-5xl px-6 py-14">
            <h1 className="text-2xl font-bold text-stone-100">Guardian Payroll</h1>
            <p className="mt-4 text-stone-400">
              Create a Business vault to use payroll reporting.
            </p>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const profileId = businessProfiles[0].id as string;
  const businessName = await getBusinessName(supabase, profileId);
  const reports = await listPayrollReports(supabase, profileId);

  return (
    <div className="flex min-h-screen flex-col bg-stone-950">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight text-stone-100">
            Guardian Payroll
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-400">
            Prepare payroll from employee timesheets, approve reports, and securely
            share with your payroll company — without giving them vault access.
          </p>
          <div className="mt-8">
            <PayrollReportList
              profileId={profileId}
              businessName={businessName}
              initialReports={reports}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
