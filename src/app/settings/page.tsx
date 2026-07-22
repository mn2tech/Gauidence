import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SettingsForm from "@/components/SettingsForm";
import NotificationSettings from "@/components/NotificationSettings";
import BillingSection from "@/components/BillingSection";
import { isPlatformAdmin } from "@/lib/admin";

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
    .select("full_name, avatar_url, email, email_reminders_enabled, email_tips_enabled, company_name, push_notifications_enabled")
    .eq("id", user.id)
    .maybeSingle();

  const showUsage = isPlatformAdmin(user.email);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Manage your account, plan, password, and who Guardian watches over.
          </p>
          <p className="mt-4">
            <a
              href="/settings/profiles"
              className="text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Manage people & spaces →
            </a>
          </p>
          {showUsage ? (
            <p className="mt-2">
              <a
                href="/settings/usage"
                className="text-sm font-semibold text-brand hover:text-brand-dark"
              >
                AI usage (admin) →
              </a>
            </p>
          ) : null}
          <div className="mt-8">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted">
                  Loading plan…
                </div>
              }
            >
              <BillingSection />
            </Suspense>
          </div>
          <SettingsForm
            userId={user.id}
            email={user.email ?? ""}
            initialFullName={profile?.full_name ?? ""}
            initialCompanyName={profile?.company_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
            initialRemindersEnabled={profile?.email_reminders_enabled !== false}
            initialTipsEnabled={profile?.email_tips_enabled !== false}
          />
          <div className="mt-8 space-y-8">
            <NotificationSettings
              userId={user.id}
              initialPushEnabled={profile?.push_notifications_enabled !== false}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
