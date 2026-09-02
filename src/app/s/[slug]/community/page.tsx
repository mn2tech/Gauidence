import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";
import SummitCommunityPage from "@/components/summit-space/SummitCommunityPage";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  const knowledge = supabase
    ? await loadPublishedSummitKnowledge(supabase, slug)
    : null;

  if (!knowledge) {
    return { title: "Community Insights — Guardian" };
  }

  return {
    title: `Community Insights — ${knowledge.space.name}`,
    description:
      "See what summit attendees are adding to the Summit Knowledge Hub.",
  };
}

export default async function SummitCommunityRoute({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitCommunityPage
        summitSlug={slug}
        summitName={knowledge.space.name}
        entities={knowledge.entities}
      />
    </main>
  );
}
