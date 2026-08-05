import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import EmployeeHubDashboard from "@/components/employee-hub/EmployeeHubDashboard";
import { getActiveGuardianProfile } from "@/lib/profiles/server";

export const metadata: Metadata = {
  title: "Employee Hub — Guardian",
};

export default async function EmployeeHubPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active || active.profile_type !== "employee" || !active.parent_profile_id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
          <EmployeeHubDashboard
            employeeProfile={active}
            businessProfileId={active.parent_profile_id}
            userId={user.id}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
