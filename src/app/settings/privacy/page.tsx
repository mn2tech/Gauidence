import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PrivacyDataSection from "@/components/PrivacyDataSection";

export const metadata: Metadata = {
  title: "Privacy & Data — Guardian",
};

export default async function PrivacyDataSettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/privacy");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
        <Link
          href="/settings"
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          ← Settings
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Privacy &amp; Data
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Understand how Guardian uses your information and manage your data.
        </p>
        <PrivacyDataSection
          email={(profile?.email as string | null) ?? user.email ?? null}
          fullName={(profile?.full_name as string | null) ?? null}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
