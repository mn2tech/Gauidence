import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import ParentHomeClient from "@/components/mcps-parent/ParentHomeClient";

export const metadata: Metadata = {
  title: "My School — Guardian",
  description: "What matters for your MCPS school this week.",
};

export default async function ParentHomePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ParentHomeClient />
      </main>
    </div>
  );
}
