import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianRecruit } from "@/lib/features/recruit";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RecruitWizard from "@/components/recruit/RecruitWizard";
import {
  getJobRequirements,
  getRecruitmentJob,
  listCandidatesWithDetails,
} from "@/lib/recruit/server";

export const metadata: Metadata = {
  title: "Recruitment Job — Guardian Recruit",
};

type PageProps = { params: Promise<{ jobId: string }> };

export default async function RecruitJobPage({ params }: PageProps) {
  const { jobId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessGuardianRecruit({ email: user.email })) {
    redirect("/dashboard");
  }

  const job = await getRecruitmentJob(supabase, jobId);
  if (!job) notFound();

  const [rubric, candidates] = await Promise.all([
    getJobRequirements(supabase, jobId),
    listCandidatesWithDetails(supabase, jobId),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <RecruitWizard
            initialJob={job}
            initialRubric={rubric}
            initialCandidates={candidates}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
