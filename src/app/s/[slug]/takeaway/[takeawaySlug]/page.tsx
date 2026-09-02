import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitTakeawayPage from "@/components/summit-space/SummitTakeawayPage";
import {
  buildTakeawayPageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; takeawaySlug: string }>;
};

export default async function SummitTakeawayRoute({ params }: PageProps) {
  const { slug, takeawaySlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildTakeawayPageData(knowledge, takeawaySlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitTakeawayPage summitSlug={slug} data={pageData} />
    </main>
  );
}
