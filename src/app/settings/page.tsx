import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SettingsForm from "@/components/SettingsForm";

export const metadata: Metadata = {
  title: "Settings — Guardian",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, email, email_reminders_enabled, company_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Manage your account, password, and Guardian profiles.
          </p>
          <p className="mt-4">
            <a
              href="/settings/profiles"
              className="text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Manage Profiles →
            </a>
          </p>
          <SettingsForm
            userId={user.id}
            email={user.email ?? ""}
            initialFullName={profile?.full_name ?? ""}
            initialCompanyName={profile?.company_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
            initialRemindersEnabled={profile?.email_reminders_enabled !== false}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
