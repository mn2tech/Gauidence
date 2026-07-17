import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import VaultChatPanel from "@/components/VaultChatPanel";

export const metadata: Metadata = {
  title: "Ask Gideon — Guardian",
  description:
    "Ask Gideon about your documents, dates, amounts, and what may need attention. Your AI guide to everything in your vault.",
};

export default async function AskGideonPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader />
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <p className="p-6 text-sm text-ink-muted">Loading Ask Gideon…</p>
          }
        >
          <VaultChatPanel variant="page" />
        </Suspense>
      </div>
    </div>
  );
}
