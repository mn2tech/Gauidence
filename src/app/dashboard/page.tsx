import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { FileText, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SignOutButton from "@/components/SignOutButton";

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

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold">Your documents</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Document upload and analysis are coming in the next sprint.
                Your vault is ready and private to you.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold">Your data, protected</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Your account is protected by authenticated access and
                user-level access controls. Only you can see what you store
                here.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
