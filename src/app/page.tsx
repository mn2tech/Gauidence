import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Outfit } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";
import { GIDEON_BRAND_LINE } from "@/lib/vault/gideon";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-home",
  display: "swap",
});

const documentKinds = [
  "Insurance policies",
  "IDs & passports",
  "Leases & contracts",
  "Letters & notices",
];

const askExamples = [
  "When does my car insurance renew?",
  "What does my lease say about pets?",
  "Which documents expire this year?",
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
    error?: string;
    error_code?: string;
  }>;
}) {
  const params = await searchParams;
  if (
    params.error === "access_denied" &&
    params.error_code === "otp_expired"
  ) {
    redirect("/login?error=reset_link_expired");
  }
  if (params.error) {
    redirect(`/login?error=${encodeURIComponent(params.error)}`);
  }
  const showDeleted = params.deleted === "1";

  return (
    <div className={`${outfit.variable} home-landing flex min-h-screen flex-col`}>
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

        {/* Hero — one composition */}
        <section className="relative isolate min-h-[min(92svh,46rem)] overflow-hidden">
          <Image
            src="/branding/guardian-home-hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="home-hero-image object-cover object-center"
          />
          <div className="home-hero-veil absolute inset-0" aria-hidden />

          <div className="relative z-10 mx-auto flex min-h-[min(92svh,46rem)] max-w-4xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:pb-20 sm:pt-14">
            <div className="home-fade-up">
              <GuardianLogo
                variant="lockup"
                size="xl"
                priority
                className="mx-auto"
              />
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted sm:mt-4 sm:text-xs">
                {GUARDIAN_BRAND_TAGLINE}
              </p>
            </div>

            <h1 className="home-fade-up home-fade-up-delay-1 home-display mt-8 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:mt-10 sm:text-5xl sm:leading-[1.12]">
              Ask about your documents. We&apos;ll remember the rest.
            </h1>
            <p className="home-fade-up home-fade-up-delay-2 mx-auto mt-4 max-w-lg text-base leading-relaxed text-ink-muted sm:mt-5 sm:text-lg">
              Policies, IDs, leases, deadlines — private by default, explained
              in plain language.
            </p>

            <div className="home-fade-up home-fade-up-delay-3 mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10 sm:gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:text-base"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-foreground transition hover:text-brand sm:text-base"
              >
                Try a demo
              </Link>
            </div>
          </div>
        </section>

        {/* What you put in */}
        <section className="home-section relative overflow-hidden py-20 sm:py-28">
          <div className="home-section-wash absolute inset-0 -z-10" aria-hidden />
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="home-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Upload once. Stop digging.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Put the papers that run your life in one private vault. Guardian
              keeps the facts — so you don&apos;t have to.
            </p>
            <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-foreground sm:text-base">
              {documentKinds.map((kind) => (
                <li key={kind} className="home-doc-kind">
                  {kind}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Ask Gideon */}
        <section
          id="ask-gideon"
          className="border-y border-border-subtle bg-brand-light/40 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-3xl px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
              Ask Gideon
            </p>
            <h2 className="home-display mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ask in plain language.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              {GIDEON_BRAND_LINE}
            </p>

            <ul className="mx-auto mt-12 max-w-lg space-y-3 text-left">
              {askExamples.map((question) => (
                <li key={question}>
                  <Link
                    href={`/demo?q=${encodeURIComponent(question)}`}
                    className="home-ask-row group flex items-center justify-between gap-4 px-1 py-3 text-base text-foreground transition hover:text-brand sm:text-lg"
                  >
                    <span>&ldquo;{question}&rdquo;</span>
                    <ArrowRight className="h-4 w-4 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:text-base"
              >
                Try a demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-foreground transition hover:text-brand sm:text-base"
              >
                Create my vault
              </Link>
            </div>
          </div>
        </section>

        {/* Trust — one short block */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="home-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Private by default.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
              Your documents stay yours. We don&apos;t sell your information.
              You decide what to upload, share, or delete — and we explain what
              came from your files versus what AI suggested.
            </p>
            <Link
              href="/security"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand underline-offset-4 hover:underline"
            >
              Read our Security Principles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="home-closing relative overflow-hidden py-20 sm:py-24">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="home-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your life&apos;s papers, remembered for you.
            </h2>
            <p className="mt-4 text-base text-ink-muted sm:text-lg">
              Start a private vault in minutes.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:text-base"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
