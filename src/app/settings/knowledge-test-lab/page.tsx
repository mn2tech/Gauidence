import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import KnowledgeTestLabPanel from "@/components/admin/KnowledgeTestLabPanel";

export const metadata: Metadata = {
  title: "Guardian Knowledge Test Lab — Admin",
};

export default async function KnowledgeTestLabPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/settings");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-14">
          <p className="text-sm">
            <a href="/settings" className="text-brand hover:text-brand-dark">
              ← Settings
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Guardian Knowledge Test Lab
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Admin-only suite for Personal Space onboarding, extraction,
            retrieval, depth, corrections, and knowledge health. Never runs
            destructive tests against production user data.
          </p>
          <div className="mt-8">
            <KnowledgeTestLabPanel />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
