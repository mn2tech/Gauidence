import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import {
  filterSummitEntitiesForCategory,
  SUMMIT_CATEGORY_LABELS,
} from "@/lib/summit-space/categories";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";
import { summitOrganizationPath, summitPublicPath } from "@/lib/summit-space/constants";

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
        <p className="mt-2 text-sm text-ink-muted">
          {knowledge.space.name}
        </p>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 text-center">
            <p className="text-ink-muted">
              No {label.toLowerCase()} captured yet. Check back as summit
              content is added.
            </p>
            <Link
              href={`${summitPublicPath(slug)}#ask-gideon`}
              className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Ask Gideon instead
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                {item.entity_type === "organization" && item.slug ? (
                  <Link
                    href={summitOrganizationPath(slug, item.slug)}
                    className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand/40"
                  >
                    <p className="font-semibold">{item.name}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-ink-muted line-clamp-2">
                        {item.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium text-brand">
                      VERIFIED SUMMIT INFORMATION
                    </p>
                  </Link>
                ) : (
                  <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <p className="font-semibold">{item.name}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-ink-muted">
                        {item.description}
                      </p>
                    ) : null}
                    {item.source_label ? (
                      <p className="mt-2 text-xs text-ink-muted">
                        Source: {item.source_label}
                      </p>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
