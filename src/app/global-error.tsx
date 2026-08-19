"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
          <img
            src="/branding/guardian-icon.png"
            alt=""
            width={56}
            height={56}
            className="mx-auto h-14 w-14"
          />

          <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-[#0f766e]">
            500
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1c1917]">
            Guardian hit a critical error
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#57534e]">
            Your data is still protected. Refresh the page or return home. If
            this keeps happening, contact support.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-full bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59]"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-[#1c1917] transition hover:border-[#0f766e] hover:text-[#0f766e]"
            >
              Go home
            </a>
          </div>

          {error.digest ? (
            <p className="mt-6 text-xs text-[#57534e]">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
