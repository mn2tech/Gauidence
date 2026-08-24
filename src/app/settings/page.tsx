import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SettingsForm from "@/components/SettingsForm";
import NotificationSettings from "@/components/NotificationSettings";
import BillingSection from "@/components/BillingSection";
import StorageSection from "@/components/StorageSection";
import ShareGuardianCard from "@/components/ShareGuardianCard";
import { isPlatformAdmin } from "@/lib/admin";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  guardianReferralCode,
  guardianTryUrl,
} from "@/lib/share/guardian";

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
    .select("full_name, avatar_url, email, email_reminders_enabled, email_tips_enabled, email_vault_activity_enabled, company_name, push_notifications_enabled, auto_organize_mode, auto_organize_threshold")
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
          <p className="mt-2">
            <a
              href="/settings/privacy"
              className="text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Privacy &amp; Data →
            </a>
          </p>
          <p className="mt-2">
            <a
              href="/settings/connections"
              className="text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Connections →
            </a>
          </p>
          <p className="mt-2">
            <a
              href="/settings/knowledge"
              className="text-sm font-semibold text-brand hover:text-brand-dark"
            >
              Knowledge Engine →
            </a>
          </p>
          {isPlatformAdmin(user.email) ? (
            <p className="mt-2">
              <a
                href="/settings/knowledge-test-lab"
                className="text-sm font-semibold text-brand hover:text-brand-dark"
              >
                Guardian Knowledge Test Lab (admin) →
              </a>
            </p>
          ) : null}
          {isGuardianPackEngineEnabled({ email: user.email }) ? (
            <p className="mt-2">
              <a
                href="/settings/packs"
                className="text-sm font-semibold text-brand hover:text-brand-dark"
              >
                Packs →
              </a>
            </p>
          ) : null}
          {showUsage ? (
            <>
              <p className="mt-2">
                <a
                  href="/settings/usage"
                  className="text-sm font-semibold text-brand hover:text-brand-dark"
                >
                  AI usage (admin) →
                </a>
              </p>
              <p className="mt-2">
                <a
                  href="/settings/funnel"
                  className="text-sm font-semibold text-brand hover:text-brand-dark"
                >
                  Subscription funnel (admin) →
                </a>
              </p>
              <p className="mt-2">
                <a
                  href="/settings/experts"
                  className="text-sm font-semibold text-brand hover:text-brand-dark"
                >
                  Manage expert access (admin) →
                </a>
              </p>
              {isGuardianOntologyEnabled() ? (
                <p className="mt-2">
                  <a
                    href="/settings/ontology"
                    className="text-sm font-semibold text-brand hover:text-brand-dark"
                  >
                    Ontology Explorer (admin) →
                  </a>
                </p>
              ) : null}
            </>
          ) : null}
          <div className="mt-8 space-y-8">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted">
                  Loading plan…
                </div>
              }
            >
              <BillingSection />
            </Suspense>
            <StorageSection />
            <ShareGuardianCard
              shareUrl={guardianTryUrl(guardianReferralCode(user.id))}
            />
          </div>
          <SettingsForm
            userId={user.id}
            email={user.email ?? ""}
            initialFullName={profile?.full_name ?? ""}
            initialCompanyName={profile?.company_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
            initialRemindersEnabled={profile?.email_reminders_enabled !== false}
            initialTipsEnabled={profile?.email_tips_enabled !== false}
            initialVaultActivityEnabled={
              profile?.email_vault_activity_enabled !== false
            }
            initialAutoOrganizeMode={
              profile?.auto_organize_mode === "off" ||
              profile?.auto_organize_mode === "auto"
                ? profile.auto_organize_mode
                : "suggest"
            }
            initialAutoOrganizeThreshold={
              typeof profile?.auto_organize_threshold === "number"
                ? profile.auto_organize_threshold
                : 0.85
            }
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
