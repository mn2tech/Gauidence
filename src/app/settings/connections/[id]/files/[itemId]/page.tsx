import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SourceFileDetail from "@/components/connections/SourceFileDetail";
import { getConnectedSource } from "@/lib/connectors/services/connectedSources";
import { getSourceItem } from "@/lib/connectors/services/sourceItems";

export const metadata: Metadata = {
  title: "File details — Connections — Guardian",
};

type Props = { params: Promise<{ id: string; itemId: string }> };

export default async function SourceItemDetailPage({ params }: Props) {
  const { id, itemId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const source = await getConnectedSource(supabase, user.id, id);
  if (!source) notFound();

  const item = await getSourceItem(supabase, id, itemId);
  if (!item) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-14">
          <SourceFileDetail sourceId={id} itemId={itemId} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
