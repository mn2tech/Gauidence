"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import IntakeVerificationForm from "./IntakeVerificationForm";
import { INTAKE_ACCEPTED_TYPES, type EmploymentKind } from "@/lib/intake/types";
import { formatPhoneInput } from "@/lib/intake/contact";

type PortalMeta = {
  businessName: string;
  recipientName: string | null;
  purpose: string;
  optionalMessage: string | null;
  expiresAt: string;
  defaultEmploymentKind: EmploymentKind | null;
  recipientEmail: string;
};

type Props = {
  token: string;
};

export default function ContractorIntakePortal({ token }: Props) {
  const [meta, setMeta] = useState<PortalMeta | null>(null);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ssn, setSsn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [employmentKind, setEmploymentKind] = useState<EmploymentKind | "">("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function loadPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/${encodeURIComponent(token)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't load this form.");
        return;
      }
      if (body.requiresVerification) {
        setRequiresVerification(true);
        setMaskedEmail(body.recipientEmail ?? null);
        return;
      }
      setMeta({
        businessName: body.businessName,
        recipientName: body.recipientName,
        purpose: body.purpose,
        optionalMessage: body.optionalMessage,
        expiresAt: body.expiresAt,
        defaultEmploymentKind: body.defaultEmploymentKind ?? null,
        recipientEmail: body.recipientEmail ?? "",
      });
      setLegalName(body.recipientName ?? "");
      setEmail(body.recipientEmail ?? "");
      if (body.defaultEmploymentKind === "employee" || body.defaultEmploymentKind === "contractor") {
        setEmploymentKind(body.defaultEmploymentKind);
      }
      setRequiresVerification(false);
    } catch {
      setError("Couldn't load this form.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortal();
  }, [token]);

  const formatSsnInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) {
      setFile(null);
      return;
    }
    const mime = picked.type || "";
    const allowed = Object.keys(INTAKE_ACCEPTED_TYPES);
    const lower = picked.name.toLowerCase();
    const ok =
      allowed.includes(mime) ||
      lower.endsWith(".pdf") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp");
    if (!ok) {
      setSubmitError("Upload a PDF, JPG, PNG, or WebP file.");
      setFile(null);
      return;
    }
    setSubmitError(null);
    setFile(picked);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ssnDigits = ssn.replace(/\D/g, "");
    if (!legalName.trim()) {
      setSubmitError("Enter your full legal name.");
      return;
    }
    if (!email.trim()) {
      setSubmitError("Enter your email address.");
      return;
    }
    if (!employmentKind) {
      setSubmitError("Select employee or contractor.");
      return;
    }
    if (!ssnDigits && !file) {
      setSubmitError("Enter your SSN or upload a document (or both).");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("legalName", legalName.trim());
      formData.set("email", email.trim());
      if (phone.trim()) formData.set("phone", phone.trim());
      if (address.trim()) formData.set("address", address.trim());
      formData.set("employmentKind", employmentKind);
      if (ssnDigits) formData.set("ssn", ssnDigits);
      if (file) formData.set("file", file);

      const res = await fetch(
        `/api/intake/${encodeURIComponent(token)}/submit`,
        { method: "POST", body: formData }
      );
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Couldn't submit.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Couldn't submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (requiresVerification) {
    return (
      <IntakeVerificationForm
        token={token}
        maskedEmail={maskedEmail}
        onVerified={() => void loadPortal()}
      />
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
        <h2 className="mt-4 text-xl font-semibold text-stone-100">
          Information submitted
        </h2>
        <p className="mt-2 text-sm text-stone-400">
          Thank you. {meta?.businessName} has received your submission securely.
          You can close this page.
        </p>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="rounded-2xl border border-stone-700 bg-stone-900 p-6">
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          Secure intake powered by Guardian
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-100">
          {meta.businessName}
        </h1>
        <p className="mt-2 text-sm text-stone-400">
          {meta.recipientName
            ? `Hi ${meta.recipientName} — please provide the information below for onboarding and clearance verification.`
            : "Please provide the information below for onboarding and clearance verification."}
        </p>
        {meta.optionalMessage ? (
          <p className="mt-3 rounded-lg bg-stone-800/80 px-3 py-2 text-sm text-stone-300">
            {meta.optionalMessage}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-stone-700 bg-stone-900 p-6"
      >
        <div>
          <label className="block text-sm font-medium text-stone-200">
            I am a
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["employee", "contractor"] as EmploymentKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setEmploymentKind(kind)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  employmentKind === kind
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                    : "border-stone-600 bg-stone-800 text-stone-300 hover:border-stone-500"
                }`}
              >
                {kind === "contractor" ? "Contractor (1099)" : "Employee (W-2)"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200">
            Full legal name
          </label>
          <input
            type="text"
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="First Middle Last"
            className="mt-2 w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-stone-200">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-200">
              Phone <span className="text-stone-500">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="(555) 555-5555"
              className="mt-2 w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200">
            Address <span className="text-stone-500">(optional)</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, state, ZIP"
            className="mt-2 w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <div className="border-t border-stone-700 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Clearance verification
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200">
            Social Security number
          </label>
          <p className="mt-1 text-xs text-stone-500">
            Optional if you upload a document instead — you can provide both.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={ssn}
            onChange={(e) => setSsn(formatSsnInput(e.target.value))}
            placeholder="XXX-XX-XXXX"
            className="mt-2 w-full rounded-xl border border-stone-600 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200">
            Upload document
          </label>
          <p className="mt-1 text-xs text-stone-500">
            W-9, SSN card, or similar (PDF, JPG, PNG, WebP — max 15 MB).
          </p>
          <label
            className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-600 bg-stone-800/50 px-4 py-4 transition hover:border-stone-500"
          >
            {file ? (
              <FileUp className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <Upload className="h-5 w-5 shrink-0 text-stone-500" />
            )}
            <span className="text-sm text-stone-300">
              {file ? file.name : "Choose file"}
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onFileChange}
            />
          </label>
        </div>

        {submitError ? (
          <p className="text-sm text-red-400" role="alert">{submitError}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit securely
        </button>

        <p className="text-center text-[11px] text-stone-500">
          Encrypted in transit. Link expires{" "}
          {new Date(meta.expiresAt).toLocaleDateString()}.
        </p>
      </form>
    </div>
  );
}
