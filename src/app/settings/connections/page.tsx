import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ConnectionsPanel from "@/components/connections/ConnectionsPanel";

export const metadata: Metadata = {
  title: "Connections — Guardian",
};

export default async function ConnectionsSettingsPage() {
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
        <section className="mx-auto max-w-2xl px-6 py-14">
          <p className="text-sm">
            <a href="/settings" className="text-brand hover:text-brand-dark">
              ← Settings
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Connections
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Connect Device Storage, Drive, and other services so Guardian can
            discover files. Files stay on your device until you choose
            otherwise.
          </p>
          <div className="mt-8">
            <ConnectionsPanel />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
