"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import { createClient } from "@/lib/supabase/client";
import { collaboratorRoleLabel } from "@/lib/profiles/types";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

type Peek = {
  email: string;
  vaultName: string;
  role: string;
  expiresAt: string;
  profileType?: string;
};

export default function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState<{
    vaultName: string;
    redirectTo: string;
  } | null>(null);

  const nextPath = `/invite/${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [peekRes, session] = await Promise.all([
          fetch(`/api/invitations/${encodeURIComponent(token)}`),
          (async () => {
            const supabase = createClient();
            if (!supabase) return null;
            const { data } = await supabase.auth.getSession();
            return data.session;
          })(),
        ]);
        if (cancelled) return;
        const body = (await peekRes.json().catch(() => ({}))) as Peek & {
          error?: string;
          hint?: string;
          alreadyMember?: boolean;
          vaultName?: string;
          redirectTo?: string;
        };
        if (body.alreadyMember && body.redirectTo) {
          setAlreadyMember({
            vaultName: body.vaultName ?? "Shared vault",
            redirectTo: body.redirectTo,
          });
          setSignedIn(!!session);
          setUserEmail(session?.user.email ?? null);
          return;
        }
        if (!peekRes.ok) {
          setError(body.error ?? "This invitation isn't available.");
          setHint(
            body.hint ??
              "Ask the vault owner to open Collaborators and tap Resend invite."
          );
          return;
        }
        setPeek(body);
        setSignedIn(!!session);
        setUserEmail(session?.user.email ?? null);
      } catch {
        if (!cancelled) setError("Couldn't load this invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        profileId?: string;
        profileType?: string;
        redirectTo?: string;
        code?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't accept this invitation.");
        if (body.hint) setHint(body.hint);
        return;
      }
      const destination =
        body.redirectTo ??
        (body.profileId
          ? `/dashboard?profileId=${encodeURIComponent(body.profileId)}`
          : SIMPLE_HOME_PATH);
      router.push(destination);
      router.refresh();
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (alreadyMember) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <GuardianIcon size={48} className="mx-auto" />
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          You already have access
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          You&apos;re a collaborator on{" "}
          <span className="font-semibold text-foreground">
            {alreadyMember.vaultName}
          </span>
          . Open it from the Space switcher (top left), or go there now.
        </p>
        <Link
          href={alreadyMember.redirectTo}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Open {alreadyMember.vaultName}
        </Link>
      </div>
    );
  }

  if (error && !peek) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-medium text-red-700">{error}</p>
        {hint ? (
          <p className="mt-3 text-sm text-ink-muted">{hint}</p>
        ) : null}
        <p className="mt-4 text-xs text-ink-muted">
          Owner path: Settings → the Family Space → Collaborators →{" "}
          <strong>Resend invite</strong>, then open the new link while signed in
          as the invited email.
        </p>
        <Link
          href={SIMPLE_HOME_PATH}
          className="mt-6 inline-flex text-sm font-semibold text-brand"
        >
          Go to Guardian
        </Link>
      </div>
    );
  }

  const emailMismatch =
    signedIn &&
    peek &&
    userEmail &&
    userEmail.trim().toLowerCase() !== peek.email.trim().toLowerCase();

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex justify-center">
        <GuardianIcon size={48} />
      </div>
      <h1 className="mt-4 text-center text-xl font-bold tracking-tight">
        Vault invitation
      </h1>
      <p className="mt-2 text-center text-sm text-ink-muted">
        You&apos;ve been invited to collaborate on{" "}
        <span className="font-semibold text-foreground">
          {peek?.vaultName ?? "a vault"}
        </span>{" "}
        as {collaboratorRoleLabel(peek?.role ?? "editor")}.
      </p>
      <p className="mt-1 text-center text-xs text-ink-muted">
        Invitation for {peek?.email}
      </p>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!signedIn ? (
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Sign in to accept
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-stone-50"
          >
            Create an account
          </Link>
        </div>
      ) : emailMismatch ? (
        <div className="mt-6 space-y-3 text-center">
          <p className="text-sm text-ink-muted">
            You&apos;re signed in as {userEmail}. Sign in with{" "}
            <strong>{peek?.email}</strong> to accept.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold"
          >
            Switch account
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void accept()}
          disabled={accepting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Accept &amp; open{" "}
          {peek?.profileType === "employee" ? "employee hub" : "vault"}
        </button>
      )}
    </div>
  );
}
