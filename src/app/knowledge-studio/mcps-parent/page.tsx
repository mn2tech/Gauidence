import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import { isPlatformAdmin } from "@/lib/admin";
import McpsKnowledgeStudioClient from "@/components/knowledge-studio/McpsKnowledgeStudioClient";
import { MCPS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";

export const metadata: Metadata = {
  title: "MCPS Parent Knowledge — Knowledge Studio",
};

export default async function McpsParentKnowledgeStudioPage() {
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
        <div className="mb-8">
          <p className="text-sm font-medium text-ink-muted">
            <Link href="/knowledge-studio" className="hover:underline">
              Knowledge Studio
            </Link>
            {" / "}
            MCPS Parent Knowledge
          </p>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Curate public MCPS parent knowledge: add sources, review extracted
            items, publish intentionally, then test Gideon with citations.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/parent" className="font-medium text-brand hover:underline">
              Open parent experience →
            </Link>
          </p>
        </div>
        <McpsKnowledgeStudioClient projectSlug={MCPS_PROJECT_SLUG} />
      </main>
    </div>
  );
}
