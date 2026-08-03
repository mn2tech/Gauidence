"use client";

import Link from "next/link";
import QRCode from "react-qr-code";
import {
  ArrowRight,
  BellRing,
  FileText,
  MessageCircle,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import {
  olneyNnoPublicUrl,
  olneyNnoSignupPath,
} from "@/lib/campaigns/olney-nno";

const steps = [
  "Create your free account with email or Google.",
  "Upload one document — insurance, a bill, or a lease works great.",
  "Tap Ask Gideon and ask: “What should I know about this?”",
];

export default function OlneyNnoLanding() {
  const pageUrl = olneyNnoPublicUrl();
  const signupPath = olneyNnoSignupPath();

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-b from-brand-light via-white to-white p-8 sm:p-10">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white px-4 py-1.5 text-sm font-medium text-brand">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Olney National Night Out — complimentary gift
        </p>
        <h1 className="mt-6 max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Your documents, finally under control — free from Guardian.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Guardian is a private vault for the papers that run your life —
          insurance, leases, IDs, and letters — with Gideon, your AI guide who
          explains them in plain language and reminds you before deadlines.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href={signupPath}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
          >
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/security"
            className="text-sm font-medium text-brand hover:text-brand-dark"
          >
            Security principles
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-semibold">Understand every document</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Upload policies, IDs, and letters. Guardian extracts what matters and
            explains it clearly.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <BellRing className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-semibold">Never miss a deadline</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Track renewals and expirations. Get alerts before small dates become
            big problems.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-semibold">Ask Gideon</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Ask questions grounded in what you&apos;ve stored — not random web
            answers.
          </p>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Get started in minutes</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link
            href={signupPath}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Create free account
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <QrCode className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Share at the booth</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Scan this code on another phone to open this page, or share the
                link at your table.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center">
            <div
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              aria-label={`QR code linking to ${pageUrl}`}
            >
              <QRCode
                value={pageUrl}
                size={180}
                level="M"
                bgColor="#ffffff"
                fgColor="#1c1917"
                title="Olney National Night Out — Guardian"
              />
            </div>
            <p className="mt-4 text-center text-sm font-medium text-foreground">
              guardian.nm2tech.com/olney
            </p>
            <p className="mt-1 max-w-xs text-center text-xs text-ink-muted">
              Point a phone camera at the code and tap the link that appears.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
