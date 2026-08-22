import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import { isPlatformAdmin } from "@/lib/admin";
import CrossroadsKnowledgeStudioClient from "@/components/knowledge-studio/CrossroadsKnowledgeStudioClient";

export const metadata: Metadata = {
  title: "CrossRoads Connect — Knowledge Studio",
};

export default async function CrossroadsStudioPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/home");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-muted">
              Knowledge Studio / CrossRoads Connect
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              Website + events training
            </h1>
            <p className="mt-3 max-w-2xl text-ink-muted">
              Scan the official website, review draft facts and events, then
              publish only approved knowledge to attendees.
            </p>
          </div>
          <Link
            href="/crossroadsconnect"
            className="text-sm font-medium text-brand hover:underline"
          >
            Open public page →
          </Link>
        </div>
        <CrossroadsKnowledgeStudioClient />
      </main>
    </div>
  );
}
