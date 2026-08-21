import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { isPlatformAdmin } from "@/lib/admin";
import AdminFunnelClient from "@/components/admin/AdminFunnelClient";

export const metadata: Metadata = {
  title: "Subscription funnel — Guardian",
};

export default async function AdminFunnelPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/settings");

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Admin
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Subscription funnel
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Activation through paid conversion — keep it simple.
            </p>
          </div>
          <Link
            href="/settings/usage"
            className="text-sm font-medium text-brand hover:text-brand-dark"
          >
            AI usage →
          </Link>
        </div>
        <AdminFunnelClient />
      </main>
      <SiteFooter />
    </div>
  );
}
