import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GIDEON_BRAND_LINE } from "@/lib/vault/gideon";

const GIDEON_INTRO_VIDEO_ID = "bXbyZ18NDRM";

const embedParams = new URLSearchParams({
  rel: "0",
  /** Show your YouTube captions by default when the video plays. */
  cc_load_policy: "1",
  cc_lang_pref: "en",
});

export default function MeetGideonSection() {
  return (
    <section
      id="meet-gideon"
      className="border-y border-stone-200 bg-stone-50/80 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div className="order-2 lg:order-1">
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-900 shadow-sm">
              <iframe
                src={`https://www.youtube.com/embed/${GIDEON_INTRO_VIDEO_ID}?${embedParams}`}
                title="Meet Gideon — Guardian"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="aspect-video w-full"
                loading="lazy"
              />
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              Meet Gideon
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Your guide to everything in your vault
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-muted">
              Ask about documents, dates, amounts, and what may need attention —
              grounded in what you&apos;ve stored, explained in plain language.
            </p>
            <p className="mt-3 text-sm font-medium text-foreground">
              {GIDEON_BRAND_LINE}
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
