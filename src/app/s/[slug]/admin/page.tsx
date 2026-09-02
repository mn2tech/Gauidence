import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessSummitAdmin,
  isSummitLinked,
} from "@/lib/summit-space/adminAccess";
import { repairSummitProfileLink } from "@/lib/summit-space/linkProfile";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";
import SummitAdminCapture from "@/components/summit-space/SummitAdminCapture";
import SummitAdminContributions from "@/components/summit-space/SummitAdminContributions";
import SummitAdminSetup from "@/components/summit-space/SummitAdminSetup";
import SummitKnowledgeCoverage from "@/components/summit-space/SummitKnowledgeCoverage";

type PageProps = { params: Promise<{ slug: string }> };

export default async function SummitAdminPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  if (!supabase) {
    redirect(`/s/${slug}`);
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/s/${slug}/admin`);
  }

  const allowed = await canAccessSummitAdmin(
    supabase,
    slug,
    user.id,
    user.email
  );
  if (!allowed) {
    redirect(`/s/${slug}`);
  }

  let linked = await isSummitLinked(supabase, slug);
  if (!linked) {
    const repaired = await repairSummitProfileLink(slug, user.id);
    linked = repaired.ok;
  }
  const knowledge = await loadPublishedSummitKnowledge(supabase, slug);

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold">Summit Admin</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Rapid capture for summit intelligence. All uploads require review
          before becoming publicly visible.
        </p>
        {!linked ? <SummitAdminSetup summitSlug={slug} /> : null}
        {linked && knowledge ? <SummitKnowledgeCoverage knowledge={knowledge} /> : null}
        {linked ? <SummitAdminContributions summitSlug={slug} /> : null}
      </div>
      {linked ? <SummitAdminCapture summitSlug={slug} /> : null}
    </main>
  );
}
