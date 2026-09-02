import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitOpportunityPage from "@/components/summit-space/SummitOpportunityPage";
import {
  buildOpportunityPageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; oppSlug: string }>;
};

export default async function SummitOpportunityRoute({ params }: PageProps) {
  const { slug, oppSlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildOpportunityPageData(knowledge, oppSlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitOpportunityPage summitSlug={slug} data={pageData} />
    </main>
  );
}
