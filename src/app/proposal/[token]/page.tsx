import type { Metadata } from "next";
import PublicProposalPortal from "@/components/proposals/PublicProposalPortal";

export const metadata: Metadata = {
  title: "Client Proposal — Guardian",
  description: "Review and respond to a business proposal securely.",
};

type PageProps = { params: Promise<{ token: string }> };

export default async function ProposalPortalPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-stone-950">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <PublicProposalPortal token={token} />
      </main>
      <footer className="border-t border-stone-800 py-6 text-center text-xs text-stone-600">
        Secure proposal portal powered by Guardian
      </footer>
    </div>
  );
}
