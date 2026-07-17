import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import HelpGuide from "@/components/HelpGuide";

export const metadata: Metadata = {
  title: "Help — Guardian",
  description:
    "Quick Start checklist and short guides for vaults, documents, Daily Logs, Search, and Ask Gideon.",
};

export default async function HelpPage() {
  const supabase = await createClient();
  let signedIn = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Help &amp; Quick Start
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Set up your first vault, add something useful, then ask Gideon.
            Come back anytime you need a refresher.
          </p>
          <div className="mt-8">
            <HelpGuide signedIn={signedIn} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
