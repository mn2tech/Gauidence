"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import ErrorPageShell, {
  ErrorPagePrimaryAction,
  ErrorPageSecondaryAction,
} from "@/components/ErrorPageShell";

export default function Error({
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
    <ErrorPageShell
      code="500"
      title="Something went wrong"
      description="We hit an unexpected error. Your documents are safe — try again, or return home while we look into it."
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Try again
          </button>
          <ErrorPagePrimaryAction href="/">Go home</ErrorPagePrimaryAction>
          <ErrorPageSecondaryAction href="/help">Help center</ErrorPageSecondaryAction>
        </>
      }
    />
  );
}
