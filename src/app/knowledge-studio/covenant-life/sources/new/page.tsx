import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import { isPlatformAdmin } from "@/lib/admin";
import AddKnowledgeSourceForm from "@/components/knowledge-studio/AddKnowledgeSourceForm";
import {
  CLS_AUTHORITY,
  CLS_CATEGORY_DEFS,
  CLS_PROJECT_SLUG,
  CLS_STARTER_SOURCES,
} from "@/lib/knowledge-studio/projects/constants";

export const metadata: Metadata = {
  title: "Add Source — Covenant Life School",
};

export default async function AddCovenantLifeSourcePage() {
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
      <main className="mx-auto max-w-3xl px-6 py-10 pb-simple-nav-page">
        <p className="text-sm font-medium text-ink-muted">
          <Link
            href={`/knowledge-studio/${CLS_PROJECT_SLUG}`}
            className="hover:underline"
          >
            Covenant Life School
          </Link>
          {" / "}
          Add Source
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Add Knowledge Source</h1>
        <p className="mt-3 text-ink-muted">
          Paste an official public Covenant Life School URL — or tap a starter
          below. Guardian will fetch, extract, and create review drafts —
          nothing publishes automatically.
        </p>

        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <AddKnowledgeSourceForm
            projectSlug={CLS_PROJECT_SLUG}
            authorityDefault={CLS_AUTHORITY}
            categories={CLS_CATEGORY_DEFS.map((c) => ({
              slug: c.slug,
              name: c.name,
            }))}
            defaultScope="school"
            schoolDefault="Covenant Life School"
            starterSources={CLS_STARTER_SOURCES}
          />
        </div>
      </main>
    </div>
  );
}
