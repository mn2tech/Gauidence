"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const supabase = createClient();
  const configured = supabase !== null;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError(
        "Sign-in isn't set up on this deployment yet. The site owner needs to configure Supabase first."
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
      });
      if (error) {
        setError(error.message);
      } else {
        // Same success copy whether or not the email exists (avoid account enumeration).
        setSent(true);
      }
    } catch {
      setError(
        "We couldn't reach the sign-in service. Check your connection and try again."
      );
    }
    setLoading(false);
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Enter the email for your Guardian account and we&apos;ll send a link to
        choose a new password.
      </p>

      {!configured && (
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Sign-in isn&apos;t set up on this deployment yet.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {sent ? (
        <div
          role="status"
          className="mt-6 space-y-4 rounded-xl border border-brand/30 bg-brand-light p-4 text-sm text-brand-dark"
        >
          <p>
            If an account exists for <strong>{email.trim()}</strong>, we sent a
            reset link. Check your inbox (and spam folder) and follow the link
            to set a new password.
          </p>
          <p className="text-brand-dark/80">
            The link expires after a short time. You can request another one if
            needed.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
          <button
            type="submit"
            disabled={!configured || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand hover:text-brand-dark"
        >
          Back to log in
        </Link>
      </p>
      {sent ? (
        <p className="mt-3 text-center text-sm text-ink-muted">
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Use a different email
          </button>
        </p>
      ) : null}
    </div>
  );
}
