import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";
import { isSummitOwner } from "@/lib/summit-space/linkProfile";
import SummitHub from "@/components/summit-space/SummitHub";

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
    return { title: "Summit Hub — Guardian" };
  }

  return {
    title: `${knowledge.space.name} — Guardian`,
    description:
      knowledge.space.description ??
      knowledge.space.subtitle ??
      "Summit knowledge hub powered by Guardian.",
  };
}

export default async function SummitPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const serverClient = await createClient();
  let isOwner = false;
  if (serverClient) {
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (user) {
      isOwner = await isSummitOwner(serverClient, slug, user.id);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
      <SummitHub
        space={knowledge.space}
        entities={knowledge.entities}
        isOwner={isOwner}
      />
    </main>
  );
}
