import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import SummitOrganizationPage from "@/components/summit-space/SummitOrganizationPage";
import {
  buildOrganizationPageData,
  loadPublishedSummitKnowledge,
} from "@/lib/summit-space/retrieve";

type PageProps = {
  params: Promise<{ slug: string; orgSlug: string }>;
};

export default async function SummitOrganizationRoute({ params }: PageProps) {
  const { slug, orgSlug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const pageData = buildOrganizationPageData(knowledge, orgSlug);
  if (!pageData) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitOrganizationPage
        summitSlug={slug}
        summitName={knowledge.space.name}
        data={pageData}
      />
    </main>
  );
}
