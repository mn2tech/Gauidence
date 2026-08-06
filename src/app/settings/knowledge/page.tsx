import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import KnowledgeEnginePanel from "@/components/KnowledgeEnginePanel";

export const metadata: Metadata = {
  title: "Knowledge Engine — Guardian",
};

export default async function KnowledgeSettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-14">
          <p className="text-sm">
            <a href="/settings" className="text-brand hover:text-brand-dark">
              ← Settings
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Knowledge Engine
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Review structured facts, monitor extraction health, and retry failed
            analyses.
          </p>
          <div className="mt-8">
            <KnowledgeEnginePanel />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
