import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitSessionPage from "@/components/summit-space/SummitSessionPage";
import {
  buildSessionPageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; sessionSlug: string }>;
};

export default async function SummitSessionRoute({ params }: PageProps) {
  const { slug, sessionSlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildSessionPageData(knowledge, sessionSlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitSessionPage summitSlug={slug} {...pageData} />
    </main>
  );
}
