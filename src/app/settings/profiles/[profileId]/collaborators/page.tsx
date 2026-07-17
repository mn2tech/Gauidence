import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CollaboratorsPanel from "./CollaboratorsPanel";

export const metadata: Metadata = {
  title: "Manage access — Guardian",
};

type Props = { params: Promise<{ profileId: string }> };

export default async function CollaboratorsPage({ params }: Props) {
  const { profileId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/profiles/${profileId}/collaborators`);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <CollaboratorsPanel profileId={profileId} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
