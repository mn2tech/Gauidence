import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import {
  filterSummitEntitiesForCategory,
  SUMMIT_CATEGORY_LABELS,
} from "@/lib/summit-space/categories";
import { summitPublicPath } from "@/lib/summit-space/constants";
import { isSummitOwner } from "@/lib/summit-space/linkProfile";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";
import SummitEntityCard from "@/components/summit-space/SummitEntityCard";
import SummitEmptyState from "@/components/summit-space/SummitEmptyState";

type PageProps = { params: Promise<{ slug: string; category: string }> };

export default async function SummitCategoryPage({ params }: PageProps) {
  const { slug, category } = await params;
  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) notFound();

  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
  if (!knowledge) notFound();

  const label = SUMMIT_CATEGORY_LABELS[category];
  if (!label) notFound();

  const items = filterSummitEntitiesForCategory(category, knowledge.entities);

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
      <div className="mx-auto max-w-2xl">
        <Link
          href={summitPublicPath(slug)}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Summit Hub
        </Link>

        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{label}</h1>
        <p className="mt-2 text-sm text-ink-muted">{knowledge.space.name}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {items.length} item{items.length === 1 ? "" : "s"}
        </p>

        {items.length === 0 ? (
          <SummitEmptyState
            categoryId={category}
            summitSlug={slug}
            isOwner={isOwner}
          />
        ) : (
          <ul className="mt-8 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <SummitEntityCard summitSlug={slug} entity={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
