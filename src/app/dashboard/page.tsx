import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SignOutButton from "@/components/SignOutButton";
import DocumentManager from "@/components/DocumentManager";
import AlertsPanel from "@/components/AlertsPanel";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, email")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email;
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || null;

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
                  Welcome, {displayName}
                </h1>
                <p className="text-sm text-ink-muted">{user.email}</p>
              </div>
            </div>
            <SignOutButton />
          </div>

          <div className="mt-10 space-y-6">
            <AlertsPanel />
            <DocumentManager userId={user.id} />
            <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-sm leading-relaxed text-ink-muted">
                Your files are private to you: encrypted in transit, protected
                by authenticated access, and separated by user-level access
                controls. Deleting a document removes both the stored file and
                its record.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
