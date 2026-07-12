import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import VaultChatPanel from "@/components/VaultChatPanel";

export const metadata: Metadata = {
  title: "Ask your vault — Guardian",
  description:
    "Ask questions across your analyzed documents. Answers cite source files from your private vault.",
};

export default async function VaultChatPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col px-6 py-10 sm:py-14">
          <Link
            href="/dashboard"
            className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to documents
          </Link>
          <VaultChatPanel variant="page" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
