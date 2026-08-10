import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import LeadsScreen from "@/components/leads/LeadsScreenLazy";

export const metadata: Metadata = {
  title: "Leads — Guardian",
  description:
    "Track business contacts, find opportunities with Gideon, and turn connections into proposals.",
};

export default async function LeadsPage() {
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
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <Suspense
            fallback={
              <p className="text-sm text-ink-muted">Loading leads…</p>
            }
          >
            <LeadsScreen />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
