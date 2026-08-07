import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProposalsScreen from "@/components/proposals/ProposalsScreen";

export const metadata: Metadata = {
  title: "Proposals — Guardian",
  description:
    "Create, send, and track professional client proposals with AI, pricing, and client portals.",
};

export default async function ProposalsPage() {
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
        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <Suspense
            fallback={
              <p className="text-sm text-ink-muted">Loading proposals…</p>
            }
          >
            <ProposalsScreen />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
