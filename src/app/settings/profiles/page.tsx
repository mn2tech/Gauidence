import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfilesManager from "./ProfilesManager";

export const metadata: Metadata = {
  title: "People & spaces — Guardian",
};

export default async function ProfilesSettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
          <ProfilesManager />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
