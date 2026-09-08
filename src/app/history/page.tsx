import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import HistoryScreen from "@/components/history/HistoryScreen";

export const metadata: Metadata = {
  title: "History — Guardian",
  description: "What happened — notes, meetings, follow-ups, and sources.",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/dashboard?docs=1");
  }

  return (
    <SimpleAppShell>
      <Suspense
        fallback={<p className="p-6 text-sm text-ink-muted">Loading History…</p>}
      >
        <HistoryScreen />
      </Suspense>
    </SimpleAppShell>
  );
}
