"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  LEAD_SOURCES,
  LEAD_TYPE_LABELS,
  SMALL_BUSINESS_STATUSES,
  type LeadType,
} from "@/lib/leads/types";

export type LeadFormValues = {
  leadType: LeadType;
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
  linkedinUrl: string;
  relationshipOwner: string;
  smallBusinessStatus: string;
  uei: string;
  cageCode: string;
  naicsCodes: string;
  primaryCapabilities: string;
  federalAgenciesServed: string;
  contractVehicles: string;
  knownContracts: string;
  currentOpportunities: string;
  pastPerformanceAreas: string;
  technologyAreas: string;
  marketAgency: string;
};

const EMPTY_VALUES: LeadFormValues = {
  leadType: "commercial",
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
  linkedinUrl: "",
  relationshipOwner: "",
  smallBusinessStatus: "",
  uei: "",
  cageCode: "",
  naicsCodes: "",
  primaryCapabilities: "",
  federalAgenciesServed: "",
  contractVehicles: "",
  knownContracts: "",
  currentOpportunities: "",
  pastPerformanceAreas: "",
  technologyAreas: "",
  marketAgency: "",
};

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

type Props = {
  initialValues?: Partial<LeadFormValues>;
  onSubmit: (values: LeadFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Quick add: only essentials; full form available via expand. */
  quick?: boolean;
};

export default function LeadForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save lead",
  quick = false,
}: Props) {
  const [values, setValues] = useState<LeadFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(
    !quick ||
      initialValues?.leadType === "federal_partner" ||
      Boolean(
        initialValues?.jobTitle ||
          initialValues?.email ||
          initialValues?.phone ||
          initialValues?.website
      )
  );

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
      {quick ? (
        <p className="text-sm text-ink-muted">
          Add one person or company. For a whole list, use{" "}
          <strong className="font-medium text-foreground">Import Excel/CSV</strong>.
          Only a company name or contact name is required — add more later.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Lead type</label>
          <select
            value={values.leadType}
            onChange={(e) => {
              const next = e.target.value as LeadType;
              setField("leadType", next);
              if (next === "federal_partner") setShowDetails(true);
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="commercial">{LEAD_TYPE_LABELS.commercial}</option>
            <option value="federal_partner">{LEAD_TYPE_LABELS.federal_partner}</option>
          </select>
        </div>
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
      </div>

      {quick && !showDetails ? (
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
          <div>
            <label className="text-sm font-medium">Where we met</label>
            <input
              value={values.sourceDetail}
              onChange={(e) => setField("sourceDetail", e.target.value)}
              placeholder="Olney National Night Out"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      ) : null}

      {quick && !showDetails ? (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-sm font-medium text-brand hover:underline"
        >
          + Add email, phone, and other details
        </button>
      ) : null}

      {(!quick || showDetails) ? (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
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

      {values.leadType === "federal_partner" ? (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold">Federal partner profile</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Market / Agency</label>
              <input
                value={values.marketAgency}
                onChange={(e) => setField("marketAgency", e.target.value)}
                placeholder="Treasury, DHS"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Relationship owner</label>
              <input
                value={values.relationshipOwner}
                onChange={(e) => setField("relationshipOwner", e.target.value)}
                placeholder="Ken"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Small business status</label>
              <select
                value={values.smallBusinessStatus}
                onChange={(e) => setField("smallBusinessStatus", e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Unknown</option>
                {SMALL_BUSINESS_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">LinkedIn</label>
              <input
                value={values.linkedinUrl}
                onChange={(e) => setField("linkedinUrl", e.target.value)}
                placeholder="https://linkedin.com/company/…"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">UEI</label>
              <input
                value={values.uei}
                onChange={(e) => setField("uei", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">CAGE code</label>
              <input
                value={values.cageCode}
                onChange={(e) => setField("cageCode", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">NAICS codes</label>
              <input
                value={values.naicsCodes}
                onChange={(e) => setField("naicsCodes", e.target.value)}
                placeholder="541511, 541512"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Primary capabilities</label>
              <textarea
                value={values.primaryCapabilities}
                onChange={(e) => setField("primaryCapabilities", e.target.value)}
                rows={2}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Federal agencies served</label>
              <input
                value={values.federalAgenciesServed}
                onChange={(e) => setField("federalAgenciesServed", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contract vehicles</label>
              <input
                value={values.contractVehicles}
                onChange={(e) => setField("contractVehicles", e.target.value)}
                placeholder="Only if verified"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Known contracts</label>
              <input
                value={values.knownContracts}
                onChange={(e) => setField("knownContracts", e.target.value)}
                placeholder="Only if verified"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Current opportunities</label>
              <input
                value={values.currentOpportunities}
                onChange={(e) => setField("currentOpportunities", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Past performance areas</label>
              <input
                value={values.pastPerformanceAreas}
                onChange={(e) => setField("pastPerformanceAreas", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Technology areas</label>
              <input
                value={values.technologyAreas}
                onChange={(e) => setField("technologyAreas", e.target.value)}
                placeholder="Data, cloud, AI…"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}

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
