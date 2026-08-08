import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { EMPLOYEE_HUB_PATH } from "@/lib/employee-hub/routing";
import { employeeGideonChatEnabled } from "@/lib/employee-hub/server";
import SiteHeader from "@/components/SiteHeader";
import VaultChatPanel from "@/components/VaultChatPanelLazy";

export const metadata: Metadata = {
  title: "Ask Gideon — Employee Hub",
};

export default async function EmployeeAskPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active || active.profile_type !== "employee" || !active.parent_profile_id) {
    redirect("/ask");
  }

  const gideonEnabled = await employeeGideonChatEnabled(
    supabase,
    active.id,
    active.parent_profile_id
  );
  if (!gideonEnabled) {
    redirect(EMPLOYEE_HUB_PATH);
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader />
      <div className="border-b border-stone-200 bg-white px-4 py-2 sm:px-6">
        <Link
          href={EMPLOYEE_HUB_PATH}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Employee Hub
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <p className="p-6 text-sm text-ink-muted">Loading Ask Gideon…</p>
          }
        >
          <VaultChatPanel variant="page" />
        </Suspense>
      </div>
    </div>
  );
}
