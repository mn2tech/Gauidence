import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import BusinessAdvisorScreen from "@/components/business-advisor/BusinessAdvisorScreen";

export const metadata: Metadata = {
  title: "Business Advisor — Guardian",
  description:
    "AI-powered website and security assessment with priced proposal generation.",
};

export default async function BusinessAdvisorPage() {
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
              <p className="text-sm text-ink-muted">Loading Business Advisor…</p>
            }
          >
            <BusinessAdvisorScreen />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
