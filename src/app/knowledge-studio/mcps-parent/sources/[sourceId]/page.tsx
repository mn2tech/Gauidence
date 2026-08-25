import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import { isPlatformAdmin } from "@/lib/admin";
import SourceReviewClient from "@/components/knowledge-studio/SourceReviewClient";
import { MCPS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";

export const metadata: Metadata = {
  title: "Review Source — MCPS Parent Knowledge",
};

type PageProps = { params: Promise<{ sourceId: string }> };

export default async function ReviewMcpsSourcePage({ params }: PageProps) {
  const { sourceId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/home");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-semibold">Source Review</h1>
        <SourceReviewClient
          projectSlug={MCPS_PROJECT_SLUG}
          sourceId={sourceId}
        />
      </main>
    </div>
  );
}
