"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";

type Props = {
  token: string;
  maskedEmail: string | null;
  onVerified: () => void;
};

export default function IntakeVerificationForm({
  token,
  maskedEmail,
  onVerified,
}: Props) {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function requestCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/intake/${encodeURIComponent(token)}/verify-request`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't send code.");
      setSent(true);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send code.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/intake/${encodeURIComponent(token)}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Invalid code.");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-stone-700 bg-stone-900 p-8">
      <div className="flex items-center gap-2 text-emerald-400">
        <Mail className="h-5 w-5" />
        <h2 className="text-lg font-semibold text-stone-100">Verify your email</h2>
      </div>
      <p className="mt-3 text-sm text-stone-400">
        {maskedEmail
          ? `We'll send a 6-digit code to ${maskedEmail}`
          : "We'll send a 6-digit verification code to the email on file."}
      </p>

      {step === "request" ? (
        <button
          type="button"
          onClick={requestCode}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send verification code
        </button>
      ) : (
        <form onSubmit={submitCode} className="mt-6 space-y-4">
          {sent ? (
            <p className="text-sm text-emerald-400">Code sent. Check your email.</p>
          ) : null}
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            className="w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-center text-2xl tracking-[0.5em] text-stone-100"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify & continue
          </button>
          <button
            type="button"
            onClick={requestCode}
            disabled={loading}
            className="w-full text-sm text-stone-400 hover:text-stone-200"
          >
            Resend code
          </button>
        </form>
      )}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
