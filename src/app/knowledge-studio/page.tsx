import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import SiteHeader from "@/components/SiteHeader";

export default async function KnowledgeStudioPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/home");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm font-medium text-ink-muted">Admin only</p>
        <h1 className="mt-1 text-3xl font-semibold">Knowledge Studio</h1>
        <p className="mt-3 max-w-2xl text-ink-muted">Teach Guardian trusted organizational knowledge, review it, then publish only what attendees are allowed to use.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link href="/knowledge-studio/crossroadsconnect" className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="text-sm text-ink-muted">Pilot</div>
            <h2 className="mt-1 text-xl font-semibold">Crossroads Connect Events</h2>
            <p className="mt-2 text-sm text-ink-muted">Create, review, publish, and test event knowledge.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
