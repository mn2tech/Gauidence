import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ResearchPanel from "@/components/ResearchPanel";

export const metadata: Metadata = {
  title: "Research — Guardian",
  description:
    "Research companies and people with live web sources, connected to your Guardian vault.",
};

export default async function ResearchPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-gradient-to-b from-stone-50 to-white">
        <ResearchPanel />
      </main>
      <SiteFooter />
    </div>
  );
}
