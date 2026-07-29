import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianRecruit } from "@/lib/features/recruit";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RecruitJobList from "@/components/recruit/RecruitJobList";
import RecruitSafetyNotice from "@/components/recruit/RecruitSafetyNotice";
import { listRecruitmentJobs } from "@/lib/recruit/server";

export const metadata: Metadata = {
  title: "Guardian Recruit — Hiring Pipeline",
  description:
    "Upload resumes, analyze candidates consistently, build ranked shortlists, and generate hiring manager reports.",
};

export default async function RecruitPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessGuardianRecruit({ email: user.email })) {
    redirect("/dashboard");
  }

  const jobs = await listRecruitmentJobs(supabase);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight">Guardian Recruit</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Create jobs, upload resumes, score candidates against your rubric,
            review with human oversight, and export professional shortlist
            reports for hiring managers.
          </p>
          <div className="mt-4">
            <RecruitSafetyNotice />
          </div>
          <div className="mt-8">
            <RecruitJobList initialJobs={jobs} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
