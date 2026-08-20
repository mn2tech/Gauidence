"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";
import {
  RECOVERY_SESSION_ERROR,
  establishRecoverySession,
} from "@/lib/auth/recoverySession";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [configured] = useState(() => createClient() !== null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;

    async function waitForSession() {
      const code = searchParams.get("code");
      const initial = await establishRecoverySession(supabase!, code);
      if (cancelled) return;
      if (initial.ok) {
        setSessionReady(true);
        setCheckingSession(false);
        return;
      }

      // Cookies from /auth/callback may need a brief moment after redirect.
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 250));
        const retry = await establishRecoverySession(supabase!);
        if (cancelled) return;
        if (retry.ok) {
          setSessionReady(true);
          setCheckingSession(false);
          return;
        }
      }

      if (!cancelled) {
        setSessionReady(false);
        setCheckingSession(false);
        setError(initial.error ?? RECOVERY_SESSION_ERROR);
      }
    }

    void waitForSession();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError(
        "Sign-in isn't set up on this deployment yet. The site owner needs to configure Supabase first."
      );
      return;
    }
    setError(null);
    if (password.length < 8) {
      setError("Your password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const session = await establishRecoverySession(supabase);
      if (!session.ok) {
        setError(session.error ?? RECOVERY_SESSION_ERROR);
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          /reauthentication|recent|session/i.test(updateError.message)
            ? RECOVERY_SESSION_ERROR
            : updateError.message
        );
        setLoading(false);
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?notice=password_updated");
      router.refresh();
    } catch {
      setError(
        "We couldn't update your password. Check your connection and try again."
      );
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <GuardianLogo variant="lockup" size="md" priority className="mb-3" />
      <p className="mb-8 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {GUARDIAN_BRAND_TAGLINE}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Enter a new password for your Guardian account. Use at least 8
        characters.
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

      {checkingSession ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Confirming your reset link…
        </p>
      ) : null}

      {sessionReady ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
          <div>
            <label
              htmlFor="confirm"
              className="block text-sm font-medium text-foreground"
            >
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
          <button
            type="submit"
            disabled={!configured || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Link expired?{" "}
        <Link
          href="/forgot-password"
          className="font-semibold text-brand hover:text-brand-dark"
        >
          Request a new reset email
        </Link>
      </p>
    </div>
  );
}
