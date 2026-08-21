"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  LEGAL_PATHS,
  LEGAL_VERSIONS,
  LEGAL_CONTACT,
} from "@/lib/legal/versions";

type Props = {
  email: string | null;
  fullName: string | null;
};

/**
 * Settings → Privacy & Data — working controls only.
 * Account deletion is implemented via existing SettingsForm /api/account/delete.
 */
export default function PrivacyDataSection({ email, fullName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (confirmText !== "DELETE") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't delete account.");
        return;
      }
      router.replace("/login?notice=account_deleted");
      router.refresh();
    } catch {
      setError("Couldn't delete account. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-6 rounded-2xl border border-stone-200 bg-white p-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Privacy &amp; Data
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The information you add to Guardian remains associated with your
          account and Spaces and is used to provide Guardian functionality.
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          Your information. Your Spaces. Your control.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Your data</h3>
        <dl className="mt-2 space-y-1 text-sm text-ink-muted">
          <div>
            <dt className="inline font-medium text-foreground">Email: </dt>
            <dd className="inline">{email ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Name: </dt>
            <dd className="inline">{fullName?.trim() || "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          Legal document versions currently published: Privacy{" "}
          {LEGAL_VERSIONS.privacy}, Terms {LEGAL_VERSIONS.terms}, AI Disclaimer{" "}
          {LEGAL_VERSIONS.aiDisclaimer}.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Controls</h3>
        <ul className="mt-2 space-y-2 text-sm">
          <li>
            <Link
              href="/settings"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              View &amp; edit account information →
            </Link>
          </li>
          <li>
            <Link
              href="/settings/profiles"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Manage Spaces →
            </Link>
          </li>
          <li>
            <Link
              href="/dashboard?docs=1"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Delete documents in your Spaces →
            </Link>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Legal</h3>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <li>
            <Link
              href={LEGAL_PATHS.privacy}
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href={LEGAL_PATHS.terms}
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Terms of Use
            </Link>
          </li>
          <li>
            <Link
              href={LEGAL_PATHS.aiDisclaimer}
              className="font-semibold text-brand hover:text-brand-dark"
            >
              AI Disclaimer
            </Link>
          </li>
          <li>
            <Link
              href={LEGAL_PATHS.security}
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Security Principles
            </Link>
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Questions:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT.supportEmail}`}
            className="text-brand hover:underline"
          >
            {LEGAL_CONTACT.supportEmail}
          </a>
        </p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
        <h3 className="text-sm font-semibold text-red-900">Delete account</h3>
        <p className="mt-1 text-sm text-red-900/80">
          Permanently deletes your Guardian account, Spaces, documents, and
          related data. This cannot be undone.
        </p>
        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-3 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
          >
            Delete my account…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-red-900/80">
              Type <span className="font-bold">DELETE</span> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || confirmText !== "DELETE"}
                onClick={() => void deleteAccount()}
                className="inline-flex items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Permanently delete
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmText("");
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
