import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WorkMemoryList from "@/components/WorkMemoryList";
import { listWorkProjects } from "@/lib/work-memory/server";

export const metadata: Metadata = {
  title: "Work Memory — Guardian",
  description:
    "Pick up where you left off. Guardian remembers your mission, next step, and blockers.",
};

export default async function WorkMemoryPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projects = await listWorkProjects(supabase, user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h1 className="text-2xl font-bold tracking-tight">Work Memory</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Continue where you left off. Each project holds your mission, current
            step, next action, and what you captured when you last ended a
            session.
          </p>
          <div className="mt-8">
            <WorkMemoryList initialProjects={projects} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
