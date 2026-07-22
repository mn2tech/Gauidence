import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WorkProjectDetail from "@/components/WorkProjectDetail";
import {
  getWorkProject,
  listWorkSessions,
} from "@/lib/work-memory/server";

export const metadata: Metadata = {
  title: "Project — Work Memory — Guardian",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkProjectPage({ params }: PageProps) {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const project = await getWorkProject(supabase, user.id, id);
  if (!project || project.status === "archived") notFound();

  const sessions = await listWorkSessions(supabase, user.id, id, 10);

  let profileName: string | null = null;
  if (project.profile_id) {
    const { data: profile } = await supabase
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", project.profile_id)
      .maybeSingle();
    profileName = profile?.display_name ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-14">
          <WorkProjectDetail
            project={project}
            sessions={sessions}
            profileName={profileName}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
