import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExpertDashboard from "@/components/experts/ExpertDashboard";
import { loadExpertPageData } from "@/lib/experts/page-helpers";

type PageProps = {
  params: Promise<{ expertId: string }>;
  searchParams: Promise<{ installation?: string }>;
};

export default async function ExpertDashboardPage({ params, searchParams }: PageProps) {
  const { expertId } = await params;
  const { installation: installationId } = await searchParams;
  const { supabase, expert, installation } = await loadExpertPageData(
    expertId,
    installationId
  );

  const { data: progress } = await supabase
    .from("expert_module_progress")
    .select("*")
    .eq("user_expert_id", installation.id);

  const { data: activity } = await supabase
    .from("expert_activity")
    .select("id, user_expert_id, activity_type, content_id, metadata, created_at")
    .eq("user_expert_id", installation.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <ExpertDashboard
            expert={expert}
            userExpertId={installation.id}
            progress={progress ?? []}
            activity={activity ?? []}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
