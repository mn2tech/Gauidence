"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellRing, Check, Loader2, Mail, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  email: string;
  initialFullName: string;
  initialCompanyName: string;
  avatarUrl: string | null;
  initialRemindersEnabled: boolean;
  initialTipsEnabled: boolean;
};

export default function SettingsForm({
  userId,
  email,
  initialFullName,
  initialCompanyName,
  avatarUrl,
  initialRemindersEnabled,
  initialTipsEnabled,
}: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [fullName, setFullName] = useState(initialFullName);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [remindersEnabled, setRemindersEnabled] = useState(initialRemindersEnabled);
  const [savingReminders, setSavingReminders] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  const [tipsEnabled, setTipsEnabled] = useState(initialTipsEnabled);
  const [savingTips, setSavingTips] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setNameError(null);
    setNameSaved(false);
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        company_name: companyName.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      setNameError("We couldn't save your name. Please try again.");
    } else {
      setNameSaved(true);
      router.refresh();
    }
    setSavingName(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError("Your password needs at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The two passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(
        /reauthentication|recent/i.test(error.message)
          ? "For security, please sign out and sign back in, then try changing your password again."
          : error.message
      );
    } else {
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPassword(false);
  }

  async function handleToggleReminders() {
    if (!supabase || savingReminders) return;
    const next = !remindersEnabled;
    setRemindersError(null);
    setRemindersEnabled(next);
    setSavingReminders(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        email_reminders_enabled: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      setRemindersEnabled(!next);
      setRemindersError("We couldn't save that change. Please try again.");
    }
    setSavingReminders(false);
  }

  async function handleToggleTips() {
    if (!supabase || savingTips) return;
    const next = !tipsEnabled;
    setTipsError(null);
    setTipsEnabled(next);
    setSavingTips(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        email_tips_enabled: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      setTipsEnabled(!next);
      setTipsError("We couldn't save that change. Please try again.");
    }
    setSavingTips(false);
  }

  const deleteConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  async function performDeleteAccount() {
    if (!supabase) {
      setDeleteError(
        "Sign-in isn't available in this browser. Refresh the page and try again."
      );
      return;
    }

    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(
          body.error ?? "We couldn't delete your account. Please try again."
        );
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      window.location.assign("/?deleted=1");
    } catch {
      setDeleteError("We couldn't reach the server. Check your connection and try again.");
      setDeleting(false);
    }
  }

  function handleDeleteAccount() {
    if (!deleteConfirmed || deleting) return;
    setDeleteModalOpen(true);
  }

  async function confirmDeleteAccount() {
    setDeleteModalOpen(false);
    await performDeleteAccount();
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <div className="mt-8 space-y-6">
      {/* Profile */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-base font-semibold">Profile</h2>
        <div className="mt-4 flex items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-full border border-stone-200 object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand">
              <UserRound className="h-6 w-6" />
            </span>
          )}
          <div className="text-sm text-ink-muted">
            <p>{email}</p>
            <p className="text-xs">
              Your photo comes from your sign-in provider.
            </p>
          </div>
        </div>
        <form onSubmit={handleSaveName} className="mt-4 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setNameSaved(false);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium">
              Company or organization name{" "}
              <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                setNameSaved(false);
              }}
              placeholder="e.g. NM2TECH LLC"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Leave blank if you use Guardian as an individual. If you add a company
              name, invoice analysis can tell whether you are the payer or the recipient.
            </p>
          </div>
          {nameError && (
            <p role="alert" className="text-sm text-red-700">
              {nameError}
            </p>
          )}
          <button
            type="submit"
            disabled={savingName}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {savingName ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : nameSaved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {nameSaved ? "Saved" : "Save profile"}
          </button>
        </form>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-base font-semibold">Password</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Change your password — or set one if you signed up with Google, so
          you can log in either way.
        </p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {passwordError && (
            <p role="alert" className="text-sm text-red-700">
              {passwordError}
            </p>
          )}
          {passwordSaved && (
            <p role="status" className="text-sm text-brand-dark">
              Your password has been updated.
            </p>
          )}
          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      </section>

      {/* Email reminders */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-brand" />
              <h2 className="text-base font-semibold">Email reminders</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              We email {email}
              {" "}
              when a deadline from your documents is a week away, and again
              the day before it&apos;s due. Dismissed alerts are never emailed.
            </p>
            {remindersError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {remindersError}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={remindersEnabled}
            aria-label="Email reminders"
            onClick={handleToggleReminders}
            disabled={savingReminders}
            className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
              remindersEnabled ? "bg-brand" : "bg-stone-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                remindersEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand" />
              <h2 className="text-base font-semibold">Getting started emails</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Short tips to help you set up Guardian — welcome notes, gentle
              nudges, and congratulations when you earn an award.
            </p>
            {tipsError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {tipsError}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tipsEnabled}
            aria-label="Getting started emails"
            onClick={handleToggleTips}
            disabled={savingTips}
            className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
              tipsEnabled ? "bg-brand" : "bg-stone-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                tipsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-base font-semibold text-red-800">Delete account</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-red-900/80">
          This permanently removes your account, profile, all uploaded
          documents and stored files, extracted data, and alerts. It cannot be
          undone.
        </p>
        <label htmlFor="confirmDelete" className="mt-4 block text-sm font-medium text-red-900">
          Type <span className="font-mono font-bold">DELETE</span> to confirm
        </label>
        <input
          id="confirmDelete"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        />
        {deleteError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {deleteError}
          </p>
        )}
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={!deleteConfirmed || deleting}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
          {deleting ? "Deleting your account…" : "Delete my account permanently"}
        </button>
      </section>

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => !deleting && setDeleteModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3
                  id="delete-account-title"
                  className="text-base font-semibold text-foreground"
                >
                  Delete your account permanently?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  This removes your account, profile, documents, extracted data,
                  alerts, and chat history from Guardian. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteAccount()}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
