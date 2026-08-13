import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import BrowseSourceFiles from "@/components/connections/BrowseSourceFiles";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";

export const metadata: Metadata = {
  title: "Browse Files — Connections — Guardian",
};

type Props = { params: Promise<{ id: string }> };

export default async function BrowseConnectionFilesPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const source = await getConnectedSource(supabase, user.id, id);
  if (!source) notFound();

  const folderName =
    source.sourceType === "trello"
      ? String(source.settings?.username ?? source.displayName ?? "Trello")
      : String(source.settings?.folderName ?? "Folder");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-14">
          <p className="text-sm">
            <a
              href="/settings/connections"
              className="text-brand hover:text-brand-dark"
            >
              ← Connections
            </a>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Browse Files
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Device Storage · {folderName} · metadata only
          </p>
          <div className="mt-8">
            <BrowseSourceFiles sourceId={id} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
