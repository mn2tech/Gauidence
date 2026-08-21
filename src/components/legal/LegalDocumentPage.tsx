import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { LEGAL_CONTACT } from "@/lib/legal/versions";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  list?: string[];
  paragraphsAfter?: string[];
};

type Props = {
  title: string;
  description: string;
  effectiveDate: string;
  lastUpdated: string;
  version: string;
  sections: LegalSection[];
  /** Optional callout under the hero */
  callout?: string;
};

export default function LegalDocumentPage({
  title,
  description,
  effectiveDate,
  lastUpdated,
  version,
  sections,
  callout,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-stone-200 bg-brand-light/60">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-dark"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Guardian
            </Link>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-muted">
              {description}
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
              <div>
                <dt className="inline font-medium text-foreground">
                  Effective date:{" "}
                </dt>
                <dd className="inline">{effectiveDate}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">
                  Last updated:{" "}
                </dt>
                <dd className="inline">{lastUpdated}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Version: </dt>
                <dd className="inline">{version}</dd>
              </div>
            </dl>
            {callout ? (
              <p className="mt-4 rounded-xl border border-brand/20 bg-white p-4 text-sm font-medium text-foreground">
                {callout}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-14">
          <nav className="mb-12 rounded-2xl border border-stone-200 bg-white p-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              On this page
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="hover:text-brand">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-12">
            {sections.map((s) => (
              <article key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-semibold tracking-tight">
                  {s.title}
                </h2>
                {s.paragraphs?.map((p) => (
                  <p
                    key={p.slice(0, 48)}
                    className="mt-3 leading-relaxed text-ink-muted"
                  >
                    {p}
                  </p>
                ))}
                {s.list ? (
                  <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-muted">
                    {s.list.map((item) => (
                      <li key={item.slice(0, 48)} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.paragraphsAfter?.map((p) => (
                  <p
                    key={p.slice(0, 48)}
                    className="mt-3 leading-relaxed text-ink-muted"
                  >
                    {p}
                  </p>
                ))}
              </article>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-stone-200 bg-stone-50/80 p-6 text-sm text-ink-muted">
            <p className="font-semibold text-foreground">Contact</p>
            <p className="mt-2 leading-relaxed">
              {LEGAL_CONTACT.company} operates Guardian. For privacy or legal
              questions, email{" "}
              <a
                href={`mailto:${LEGAL_CONTACT.supportEmail}`}
                className="font-medium text-brand hover:text-brand-dark"
              >
                {LEGAL_CONTACT.supportEmail}
              </a>
              . For security concerns, see our{" "}
              <Link href="/security" className="font-medium text-brand hover:text-brand-dark">
                Security Principles
              </Link>{" "}
              page.
            </p>
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="/ai-disclaimer" className="hover:text-foreground">
                AI Disclaimer
              </Link>
              <Link href="/security" className="hover:text-foreground">
                Security
              </Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
