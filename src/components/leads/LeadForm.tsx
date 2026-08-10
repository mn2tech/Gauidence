"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LEAD_SOURCES } from "@/lib/leads/types";

export type LeadFormValues = {
  companyName: string;
  contactName: string;
  jobTitle: string;
  email: string;
  phone: string;
  website: string;
  source: string;
  customSource: string;
  sourceDetail: string;
  notes: string;
};

const EMPTY_VALUES: LeadFormValues = {
  companyName: "",
  contactName: "",
  jobTitle: "",
  email: "",
  phone: "",
  website: "",
  source: "",
  customSource: "",
  sourceDetail: "",
  notes: "",
};

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

type Props = {
  initialValues?: Partial<LeadFormValues>;
  onSubmit: (values: LeadFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export default function LeadForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save lead",
}: Props) {
  const [values, setValues] = useState<LeadFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.companyName.trim() && !values.contactName.trim()) {
      setError("Enter a company name or contact name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save lead.");
    } finally {
      setBusy(false);
    }
  }

  const showCustomSource = values.source === "Other";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Company name</label>
          <input
            value={values.companyName}
            onChange={(e) => setField("companyName", e.target.value)}
            placeholder="ABC Accounting"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Contact name</label>
          <input
            value={values.contactName}
            onChange={(e) => setField("contactName", e.target.value)}
            placeholder="John Smith"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Job title</label>
          <input
            value={values.jobTitle}
            onChange={(e) => setField("jobTitle", e.target.value)}
            placeholder="Owner"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="john@abc.com"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <input
            value={values.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="301-555-0100"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Website</label>
          <input
            value={values.website}
            onChange={(e) => setField("website", e.target.value)}
            placeholder="abc.com"
            className={`mt-1 ${inputClass}`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Source</label>
          <select
            value={values.source}
            onChange={(e) => setField("source", e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Select source…</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {showCustomSource ? (
          <div>
            <label className="text-sm font-medium">Custom source</label>
            <input
              value={values.customSource}
              onChange={(e) => setField("customSource", e.target.value)}
              placeholder="Describe the source"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        ) : null}
        <div className={showCustomSource ? "sm:col-span-2" : ""}>
          <label className="text-sm font-medium">Where we met</label>
          <input
            value={values.sourceDetail}
            onChange={(e) => setField("sourceDetail", e.target.value)}
            placeholder="Olney National Night Out"
            className={`mt-1 ${inputClass}`}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          value={values.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={3}
          placeholder="Met John at the community event. Interested in AI."
          className={`mt-1 ${inputClass}`}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function resolveSourceForApi(values: LeadFormValues): string | null {
  if (values.source === "Other" && values.customSource.trim()) {
    return values.customSource.trim();
  }
  if (values.source.trim()) return values.source.trim();
  return null;
}
