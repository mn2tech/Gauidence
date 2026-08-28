import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DemoVaultAsk from "@/components/demo/DemoVaultAsk";
import GuardianLogo from "@/components/brand/GuardianLogo";

export const metadata: Metadata = {
  title: "Try a demo — Guardian",
  description:
    "Ask Gideon about a sample lease, insurance policy, and HOA notice — no account needed.",
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const initialQuestion = params.q?.trim() ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="relative overflow-hidden border-b border-border-subtle">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 80% 55% at 50% 0%, color-mix(in srgb, var(--brand-glow) 70%, white), var(--background) 70%)",
            }}
          />
          <div className="mx-auto max-w-5xl px-6 pb-6 pt-10 sm:pt-12">
            <Link href="/" className="inline-flex">
              <GuardianLogo variant="horizontal" size="sm" />
            </Link>
            <p className="mt-4 text-sm text-ink-muted">
              Demo only — answers come from sample documents, not your files.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <DemoVaultAsk initialQuestion={initialQuestion} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
