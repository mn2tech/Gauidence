import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitResourcePage from "@/components/summit-space/SummitResourcePage";
import {
  buildResourcePageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; resourceSlug: string }>;
};

export default async function SummitResourceRoute({ params }: PageProps) {
  const { slug, resourceSlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildResourcePageData(knowledge, resourceSlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitResourcePage summitSlug={slug} data={pageData} />
    </main>
  );
}
