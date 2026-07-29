import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianRecruit } from "@/lib/features/recruit";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RecruitReportView from "@/components/recruit/RecruitReportView";
import { buildRecruitReportData } from "@/lib/recruit/reportData";
import { getRecruitmentJob } from "@/lib/recruit/server";

export const metadata: Metadata = {
  title: "Shortlist report — Guardian Recruit",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ jobId: string }> };

export default async function RecruitJobReportPage({ params }: Props) {
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

  const report = await buildRecruitReportData(supabase, jobId, user);
  if (!report) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-12">
          <RecruitReportView report={report} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
