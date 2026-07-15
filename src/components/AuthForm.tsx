"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GoogleIcon from "@/components/GoogleIcon";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "Google sign-in was canceled. You can try again whenever you're ready.",
  provider_error:
    "Google could not complete the sign-in. Please try again in a moment.",
  exchange_failed:
    "We couldn't finish signing you in. Please try again — if it keeps happening, contact support.",
  not_configured:
    "Sign-in isn't set up on this deployment yet. The site owner needs to configure Supabase first.",
  google_not_enabled:
    "Google sign-in isn't available yet on this site. You can create an account with email and password instead.",
};

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const urlError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    urlError ? ERROR_MESSAGES[urlError] ?? ERROR_MESSAGES.provider_error : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const configured = supabase !== null;
  const isSignup = mode === "signup";

  async function handleGoogle() {
    if (!supabase) {
      setError(ERROR_MESSAGES.not_configured);
      return;
    }
    setError(null);
    setGoogleLoading(true);
    try {
      // signInWithOAuth navigates away immediately, so a disabled provider
      // would dump raw JSON in the browser. Check availability first.
      const settingsRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings?apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      );
      const settings = await settingsRes.json();
      if (!settings?.external?.google) {
        setError(ERROR_MESSAGES.google_not_enabled);
        setGoogleLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        setError(ERROR_MESSAGES.provider_error);
        setGoogleLoading(false);
      }
      // On success the browser navigates away to Google.
    } catch {
      setError(
        "We couldn't reach the sign-in service. Check your connection and try again."
      );
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError(ERROR_MESSAGES.not_configured);
      return;
    }
    setError(null);
    setNotice(null);
    setEmailLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (error) {
          setError(error.message);
        } else if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        } else {
          setNotice(
            "Almost there — check your email for a confirmation link to finish creating your account."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(
            error.message === "Invalid login credentials"
              ? "That email and password combination didn't match. Please try again."
              : error.message
          );
        } else {
          router.push("/dashboard");
          router.refresh();
          return;
        }
      }
    } catch {
      setError(
        "We couldn't reach the sign-in service. Check your connection and try again."
      );
    }
    setEmailLoading(false);
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {isSignup
          ? "Start protecting the documents you cannot afford to lose."
          : "Log in to get back to your documents."}
      </p>

      {!configured && (
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {ERROR_MESSAGES.not_configured}
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

      {notice && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-brand/30 bg-brand-light p-4 text-sm text-brand-dark"
        >
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={handleGoogle}
        disabled={!configured || googleLoading}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {googleLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <GoogleIcon className="h-5 w-5" />
        )}
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-stone-200" />
        <span className="text-xs uppercase tracking-widest text-ink-muted">
          or continue with email
        </span>
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        {isSignup && (
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-foreground"
            >
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
        )}
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
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            {!isSignup ? (
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand hover:text-brand-dark"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        </div>
        <button
          type="submit"
          disabled={!configured || emailLoading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {emailLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSignup ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Log in
            </Link>
          </>
        ) : (
          <>
            New to Guardian?{" "}
            <Link
              href="/signup"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
