import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SignOutButton from "@/components/SignOutButton";
import DashboardVault from "@/components/DashboardVault";
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

  const active = await getActiveGuardianProfile(supabase, user);
  const displayName = active.display_name;
  const avatarUrl = active.avatar_url;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-14">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full border border-stone-200 object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
                  <UserRound className="h-7 w-7" />
                </span>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {active.profile_type === "business"
                    ? displayName
                    : `Welcome, ${displayName}`}
                </h1>
                <p className="text-sm text-ink-muted">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
