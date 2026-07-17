import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import InviteAcceptClient from "./InviteAcceptClient";

export const metadata: Metadata = {
  title: "Vault invitation — Guardian",
};

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
          <InviteAcceptClient token={token} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
