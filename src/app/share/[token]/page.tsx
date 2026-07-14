import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SharedDocumentView from "@/components/SharedDocumentView";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Shared document — Guardian",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: Props) {
  const { token } = await params;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-12">
          <div className="mb-8 flex items-center gap-2 text-sm text-ink-muted">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <span>Shared securely via Guardian</span>
            <span className="text-stone-300">·</span>
            <Link href="/" className="text-brand hover:text-brand-dark">
              Learn more
            </Link>
          </div>
          <SharedDocumentView token={token} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
