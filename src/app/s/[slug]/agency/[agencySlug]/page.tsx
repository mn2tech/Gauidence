import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitAgencyPage from "@/components/summit-space/SummitAgencyPage";
import {
  buildAgencyPageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; agencySlug: string }>;
};

export default async function SummitAgencyRoute({ params }: PageProps) {
  const { slug, agencySlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildAgencyPageData(knowledge, agencySlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitAgencyPage summitSlug={slug} data={pageData} />
    </main>
  );
}
