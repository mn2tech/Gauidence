import type { Metadata } from "next";
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
        <section className="mx-auto max-w-4xl px-6 py-14">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <WelcomeProfileStrip
                ownerName={ownerName}
                ownerEmail={user.email}
              />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <SignOutButton />
            </div>
          </div>

          <div className="mt-10">
            <DashboardVault userId={user.id} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
