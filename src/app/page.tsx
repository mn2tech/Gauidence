import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SecuritySection from "@/components/SecuritySection";
import MeetGideonSection from "@/components/MeetGideonSection";
import GuardianLogo from "@/components/brand/GuardianLogo";

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

        <section className="landing-hero relative overflow-hidden">
          <div className="mx-auto max-w-3xl px-6 pb-12 pt-14 text-center sm:pb-14 sm:pt-20">
            <div className="landing-hero-fade" style={{ animationDelay: "0ms" }}>
              <GuardianLogo
                variant="lockup"
                size="lg"
                priority
                className="mx-auto"
              />
            </div>
            <h1
              className="landing-hero-fade mx-auto mt-8 max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              The documents that run your life, finally under control.
            </h1>
            <p
              className="landing-hero-fade mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted"
              style={{ animationDelay: "160ms" }}
            >
              Guardian reads what you store and puts the next deadline in front
              of you.
            </p>
            <div
              className="landing-hero-fade mt-8 flex flex-wrap items-center justify-center gap-4"
              style={{ animationDelay: "240ms" }}
            >
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
          </div>

          <div
            className="landing-hero-fade landing-hero-moment mx-auto w-full max-w-2xl px-6 pb-20 sm:pb-28"
            style={{ animationDelay: "400ms" }}
          >
            <p className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Today&apos;s priorities
            </p>
            <div className="mt-4 flex items-start gap-3">
              <span
                className="landing-hero-dot mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
              <div className="min-w-0 text-left">
                <p className="text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl">
                  Auto insurance renews in 11 days
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-stone-800 sm:text-base">
                  Your State Farm policy ends May 14. Review coverage before it
                  lapses.
                </p>
              </div>
            </div>
          </div>
        </section>

        <MeetGideonSection />

        <SecuritySection />
      </main>

      <SiteFooter />
    </div>
  );
}
