import type { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { createClient } from "@/lib/supabase/server";
import {
  FREE_PRICE_DISPLAY,
  PLAN_IDS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_PRICE_DISPLAY,
  PLAN_TAGLINES,
  type PlanId,
} from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing — Guardian",
  description:
    "Free, Personal, Family, and Business plans for Guardian document vaults, Ask Gideon, and Research.",
};

function priceFor(plan: PlanId): string {
  if (plan === "free") return FREE_PRICE_DISPLAY;
  return PLAN_PRICE_DISPLAY[plan];
}

function ctaHref(plan: PlanId, signedIn: boolean): string {
  if (signedIn) return "/settings";
  if (plan === "free") return "/signup";
  return `/signup?plan=${plan}`;
}

function ctaLabel(plan: PlanId, signedIn: boolean): string {
  if (signedIn) return "Manage plan";
  if (plan === "free") return "Get started free";
  return `Start ${PLAN_LABELS[plan]}`;
}

export default async function PricingPage() {
  const supabase = await createClient();
  let signedIn = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-light via-background to-background" />
          <div className="mx-auto max-w-6xl px-6 pb-12 pt-16 text-center sm:pb-16 sm:pt-20">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Simple pricing for every vault
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Start free. Upgrade when you need more analyses, Ask Gideon, and
              Research. Cancel anytime from Settings.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 sm:pb-28">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_IDS.map((plan) => {
              const limits = PLAN_LIMITS[plan];
              const featured = plan === "personal";
              const features = [
                `${limits.analyzePerMonth} document analyses / month`,
                `${limits.chatPerMonth.toLocaleString("en-US")} Ask Gideon / chat turns`,
                `${limits.researchPerMonth} Research briefs / month`,
                "Private vaults & deadline alerts",
                "Ask Gideon grounded in your documents",
              ];
              return (
                <div
                  key={plan}
                  className={`flex flex-col rounded-2xl border bg-white p-6 ${
                    featured
                      ? "border-brand shadow-sm ring-1 ring-brand/20"
                      : "border-stone-200"
                  }`}
                >
                  {featured ? (
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand">
                      Most popular
                    </p>
                  ) : (
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-transparent">
                      &nbsp;
                    </p>
                  )}
                  <h2 className="text-lg font-semibold">{PLAN_LABELS[plan]}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    {PLAN_TAGLINES[plan]}
                  </p>
                  <p className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight">
                      {priceFor(plan).replace("/mo", "")}
                    </span>
                    {plan !== "free" ? (
                      <span className="text-sm text-ink-muted">/ month</span>
                    ) : (
                      <span className="text-sm text-ink-muted">forever</span>
                    )}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-ink-muted"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={ctaHref(plan, signedIn)}
                    className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      featured
                        ? "bg-brand text-white hover:bg-brand-dark"
                        : "border border-stone-300 bg-white text-foreground hover:border-brand hover:text-brand"
                    }`}
                  >
                    {ctaLabel(plan, signedIn)}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-10 text-center text-sm text-ink-muted">
            Billing is handled securely by Stripe. Already subscribed?{" "}
            <Link
              href="/settings"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Manage billing in Settings
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
