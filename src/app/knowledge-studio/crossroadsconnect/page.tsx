import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import SiteHeader from "@/components/SiteHeader";
import EventStudio from "./EventStudio";

export default async function CrossroadsStudioPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/home");

  return <div className="min-h-screen bg-[var(--background)]"><SiteHeader /><main className="mx-auto max-w-5xl px-6 py-10"><p className="text-sm font-medium text-ink-muted">Knowledge Studio / Crossroads Connect</p><h1 className="mt-1 text-3xl font-semibold">Events training</h1><p className="mt-3 mb-8 max-w-2xl text-ink-muted">Create trusted event facts, review them, and publish only approved knowledge to attendees.</p><EventStudio /></main></div>;
}
