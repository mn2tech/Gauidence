import Link from "next/link";
import { ArrowRight, BellRing, FileText, ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SecuritySection from "@/components/SecuritySection";
import MeetGideonSection from "@/components/MeetGideonSection";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";

const features = [
  {
    icon: FileText,
    title: "Understand every document",
    body: "Upload insurance policies, IDs, leases, and letters. Guardian extracts the facts that matter and explains them in plain language.",
  },
  {
    icon: BellRing,
    title: "Never miss a deadline",
    body: "Guardian tracks renewal dates, expirations, and required actions, and alerts you before they become problems.",
  },
  {
    icon: ShieldCheck,
    title: "Keep it all in one safe place",
    body: "Your documents live in one private, organized vault — tied to your account and visible only to you.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const params = await searchParams;
  const showDeleted = params.deleted === "1";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {showDeleted ? (
          <div
            role="status"
            className="border-b border-brand/20 bg-brand-light px-6 py-3 text-center text-sm text-brand-dark"
          >
            Your account has been deleted. You&apos;re signed out — take care.
          </div>
        ) : null}

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-light via-background to-background" />
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-20">
            <GuardianLogo
              variant="lockup"
              size="lg"
              priority
              className="mx-auto"
            />
            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted sm:text-xs">
              {GUARDIAN_BRAND_TAGLINE}
            </p>
            <p className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4" />
              Private by default
            </p>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              The documents that run your life, finally under control.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Guardian remembers what matters — documents, notes, deadlines —
              so you can ask instead of search. Private by default, explained in
              plain language.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-foreground transition hover:border-brand hover:text-brand"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              <Link href="/security" className="underline-offset-2 hover:underline">
                Read our Security Principles
              </Link>
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 pb-20 sm:pb-28">
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-stone-200 bg-white p-6"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <MeetGideonSection />

        <SecuritySection />
      </main>

      <SiteFooter />
    </div>
  );
}
