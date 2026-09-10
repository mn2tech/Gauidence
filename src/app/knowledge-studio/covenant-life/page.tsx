import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import { isPlatformAdmin } from "@/lib/admin";
import McpsKnowledgeStudioClient from "@/components/knowledge-studio/McpsKnowledgeStudioClient";
import { CLS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";

export const metadata: Metadata = {
  title: "Covenant Life School — Knowledge Studio",
};

export default async function CovenantLifeKnowledgeStudioPage() {
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
            Covenant Life School
          </p>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Curate public Covenant Life School knowledge from{" "}
            <a
              href="https://www.covenantlifeschool.org/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand hover:underline"
            >
              covenantlifeschool.org
            </a>
            : add sources, review extracted items, publish intentionally, then
            test Gideon with citations.
          </p>
        </div>
        <McpsKnowledgeStudioClient
          projectSlug={CLS_PROJECT_SLUG}
          emptySourcesHint="No sources yet. Start with high-value public CLS pages (admissions, parent resources, calendar, academics)."
          showParentIntelligence={false}
        />
      </main>
    </div>
  );
}
