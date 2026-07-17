import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SignOutButton from "@/components/SignOutButton";
import DashboardVault from "@/components/DashboardVault";
import WelcomeProfileStrip from "@/components/WelcomeProfileStrip";
import { getActiveGuardianProfile } from "@/lib/profiles/server";

export const metadata: Metadata = {
  title: "Dashboard — Guardian",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await getActiveGuardianProfile(supabase, user);

  const { data: account } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const ownerName =
    account?.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "") ||
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "") ||
    (user.email ? user.email.split("@")[0] : null) ||
    "there";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-4 sm:py-2"
              >
                <Settings className="h-4 w-4" />
                <span className="sm:inline">Settings</span>
              </Link>
              <SignOutButton />
            </div>
            <Suspense fallback={null}>
              <WelcomeProfileStrip
                ownerName={ownerName}
                ownerEmail={user.email}
              />
            </Suspense>
          </div>

          <div className="mt-8 sm:mt-10">
            <Suspense
              fallback={<p className="text-sm text-ink-muted">Loading vault…</p>}
            >
              <DashboardVault userId={user.id} />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
