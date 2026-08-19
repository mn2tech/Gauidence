"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import LeadConflictResolver from "@/components/leads/LeadConflictResolver";
import LeadFieldEvidence from "@/components/leads/LeadFieldEvidence";
import LeadPartnerFitCard from "@/components/leads/LeadPartnerFitCard";
import LeadResearchProgress from "@/components/leads/LeadResearchProgress";
import LeadTagInput from "@/components/leads/LeadTagInput";
import {
  CAPABILITY_CATALOG,
  PAST_PERFORMANCE_TAGS,
  TECHNOLOGY_CATALOG,
} from "@/lib/leads/research/catalogs";
import {
  detectResearchConflicts,
  type ExistingLeadFields,
} from "@/lib/leads/research/conflicts";
import { snapshotToFormPatch } from "@/lib/leads/research/formPatch";
import { parseSmallBusinessStatuses } from "@/lib/leads/research/normalize";
import type {
  FieldDecision,
  LeadResearchSnapshot,
  ResearchCandidate,
  ResearchFieldConflict,
} from "@/lib/leads/research/types";
import {
  LEAD_SOURCES,
  LEAD_TYPE_LABELS,
  SMALL_BUSINESS_STATUSES,
  type LeadType,
} from "@/lib/leads/types";

export type LeadFormValues = {
  leadType: LeadType;
  companyName: string;
  legalCompanyName: string;
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
  headquarters: string;
  companyDescription: string;
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
  recommendedOutreachAngle: string;
  whyCompanyMatters: string;
  nm2techCanBring: string;
  researchSnapshot: LeadResearchSnapshot | null;
};

const EMPTY_VALUES: LeadFormValues = {
  leadType: "commercial",
  companyName: "",
  legalCompanyName: "",
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
  headquarters: "",
  companyDescription: "",
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
  recommendedOutreachAngle: "",
  whyCompanyMatters: "",
  nm2techCanBring: "",
  researchSnapshot: null,
};

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

type Props = {
  initialValues?: Partial<LeadFormValues>;
  onSubmit: (values: LeadFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  quick?: boolean;
  businessProfileId?: string | null;
  leadId?: string | null;
  enableResearch?: boolean;
};

function existingFromValues(values: LeadFormValues): ExistingLeadFields {
  return {
    companyName: values.companyName,
    legalCompanyName: values.legalCompanyName,
    website: values.website,
    linkedinUrl: values.linkedinUrl,
    headquarters: values.headquarters,
    companyDescription: values.companyDescription,
    marketAgency: values.marketAgency,
    smallBusinessStatus: values.smallBusinessStatus,
    uei: values.uei,
    cageCode: values.cageCode,
    naicsCodes: values.naicsCodes,
    primaryCapabilities: values.primaryCapabilities,
    federalAgenciesServed: values.federalAgenciesServed,
    contractVehicles: values.contractVehicles,
    knownContracts: values.knownContracts,
    currentOpportunities: values.currentOpportunities,
    pastPerformanceAreas: values.pastPerformanceAreas,
    technologyAreas: values.technologyAreas,
    relationshipOwner: values.relationshipOwner,
  };
}

function applySnapshot(
  prev: LeadFormValues,
  snapshot: LeadResearchSnapshot,
  decisions: Record<string, FieldDecision>,
  confirmOwner: boolean
): LeadFormValues {
  const patch = snapshotToFormPatch(snapshot, { confirmOwner });
  const pick = (field: string, researched: string, existing: string) => {
    const decision = decisions[field] ?? (existing.trim() ? "keep" : "researched");
    if (decision === "keep") return existing;
    if (decision === "merge") {
      const conflict = detectResearchConflicts(existingFromValues(prev), snapshot).find(
        (c) => c.field === field
      );
      return conflict?.mergeValue || researched;
    }
    return researched || existing;
  };

  return {
    ...prev,
    leadType: "federal_partner",
    companyName: pick("companyName", patch.companyName, prev.companyName),
    legalCompanyName: pick("legalCompanyName", patch.legalCompanyName, prev.legalCompanyName),
    website: pick("website", patch.website, prev.website),
    linkedinUrl: pick("linkedinUrl", patch.linkedinUrl, prev.linkedinUrl),
    headquarters: pick("headquarters", patch.headquarters, prev.headquarters),
    companyDescription: pick(
      "companyDescription",
      patch.companyDescription,
      prev.companyDescription
    ),
    marketAgency: pick("marketAgency", patch.marketAgency, prev.marketAgency),
    smallBusinessStatus: pick(
      "smallBusinessStatuses",
      patch.smallBusinessStatuses.join(", "),
      prev.smallBusinessStatus
    ),
    uei: pick("uei", patch.uei, prev.uei),
    cageCode: pick("cageCode", patch.cageCode, prev.cageCode),
    naicsCodes: pick("naics", patch.naicsCodes, prev.naicsCodes),
    primaryCapabilities: pick(
      "capabilityTags",
      patch.primaryCapabilities,
      prev.primaryCapabilities
    ),
    federalAgenciesServed: pick(
      "agencies",
      patch.federalAgenciesServed,
      prev.federalAgenciesServed
    ),
    contractVehicles: pick("vehicles", patch.contractVehicles, prev.contractVehicles),
    knownContracts: pick("contracts", patch.knownContracts, prev.knownContracts),
    currentOpportunities: pick(
      "opportunities",
      patch.currentOpportunities,
      prev.currentOpportunities
    ),
    pastPerformanceAreas: pick(
      "pastPerformanceTags",
      patch.pastPerformanceAreas,
      prev.pastPerformanceAreas
    ),
    technologyAreas: pick("technologyTags", patch.technologyAreas, prev.technologyAreas),
    recommendedOutreachAngle: patch.recommendedOutreachAngle,
    whyCompanyMatters: patch.whyCompanyMatters,
    nm2techCanBring: patch.nm2techCanBring,
    relationshipOwner: confirmOwner
      ? patch.relationshipOwner || prev.relationshipOwner
      : prev.relationshipOwner,
    source: prev.source || (snapshot.uei ? "SAM.gov" : prev.source),
    researchSnapshot: snapshot,
  };
}

export default function LeadForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save lead",
  quick = false,
  businessProfileId = null,
  leadId = null,
  enableResearch = true,
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
  const [researching, setResearching] = useState(false);
  const [researchStep, setResearchStep] = useState(0);
  const [candidates, setCandidates] = useState<ResearchCandidate[] | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<LeadResearchSnapshot | null>(
    null
  );
  const [conflicts, setConflicts] = useState<ResearchFieldConflict[]>([]);
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [confirmOwner, setConfirmOwner] = useState(false);
  const [showReview, setShowReview] = useState(Boolean(initialValues?.researchSnapshot));

  useEffect(() => {
    if (!researching) return;
    setResearchStep(0);
    const id = window.setInterval(() => {
      setResearchStep((n) => Math.min(n + 1, 5));
    }, 2800);
    return () => window.clearInterval(id);
  }, [researching]);

  function setField<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const sbSelected = parseSmallBusinessStatuses(values.smallBusinessStatus);
  const snapshot = values.researchSnapshot ?? pendingSnapshot;

  async function runResearch(selected?: ResearchCandidate) {
    if (!businessProfileId) {
      setError("Switch to a business workspace to research a company.");
      return;
    }
    if (!values.companyName.trim() && !values.website.trim()) {
      setError("Enter a company name or website to research.");
      return;
    }
    setResearching(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch("/api/leads/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessProfileId,
          leadId,
          companyName: values.companyName.trim(),
          website: values.website.trim(),
          mode: leadId && values.researchSnapshot ? "refresh" : "full",
          selectedUei: selected?.uei ?? null,
          selectedHash: selected?.recipientHash ?? null,
          selectedLegalName: selected?.legalName ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Couldn't research this company."
        );
      }
      if (body.status === "needs_disambiguation") {
        setCandidates(body.candidates ?? []);
        return;
      }
      const next = body.snapshot as LeadResearchSnapshot;
      const foundConflicts = detectResearchConflicts(existingFromValues(values), next);
      setPendingSnapshot(next);
      setConflicts(foundConflicts);
      setDecisions(
        Object.fromEntries(foundConflicts.map((c) => [c.field, "keep"])) as Record<
          string,
          FieldDecision
        >
      );
      setShowReview(true);
      setShowDetails(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't research this company.");
    } finally {
      setResearching(false);
    }
  }

  function applyPendingToForm() {
    if (!pendingSnapshot) return;
    setValues((prev) => applySnapshot(prev, pendingSnapshot, decisions, confirmOwner));
    setPendingSnapshot(null);
    setConflicts([]);
    setShowDetails(true);
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
  const researchReady = Boolean(values.companyName.trim() || values.website.trim());
  const researchLabel =
    leadId && (values.researchSnapshot || initialValues?.legalCompanyName)
      ? "Refresh Research"
      : "Research & Auto-Fill";

  const checklist = pendingSnapshot?.checklist ?? values.researchSnapshot?.checklist;
  const summary = pendingSnapshot?.summary ?? values.researchSnapshot?.summary;

  const federal = values.leadType === "federal_partner";
  const researchEnabled = enableResearch && Boolean(businessProfileId);

  const appliedFacts = useMemo(
    () => values.researchSnapshot?.facts ?? pendingSnapshot?.facts,
    [values.researchSnapshot, pendingSnapshot]
  );

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {quick && federal ? (
        <p className="text-sm text-ink-muted">
          Enter a company name or website. Guardian researches federal sources, fills
          the profile, and waits for you to review before saving.
        </p>
      ) : quick ? (
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
            placeholder="Easy Dynamics"
            className={`mt-1 ${inputClass}`}
          />
          <LeadFieldEvidence fact={appliedFacts?.companyName} />
        </div>
        <div>
          <label className="text-sm font-medium">Website</label>
          <input
            value={values.website}
            onChange={(e) => setField("website", e.target.value)}
            placeholder="easydynamics.com"
            className={`mt-1 ${inputClass}`}
          />
          <LeadFieldEvidence fact={appliedFacts?.website} />
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

      {researchEnabled ? (
        <div className="space-y-3">
          <button
            type="button"
            disabled={researching || !researchReady}
            onClick={() => void runResearch()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {researching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {researchLabel}
          </button>
          {researching ? (
            <LeadResearchProgress
              companyName={values.companyName || values.website}
              stepIndex={researchStep}
            />
          ) : null}
          {candidates ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm font-semibold">Select the correct organization</p>
              <p className="mt-1 text-xs text-ink-muted">
                Multiple legal entities matched. Choose one before the form is filled.
              </p>
              <ul className="mt-3 space-y-2">
                {candidates.map((c) => (
                  <li key={`${c.uei ?? c.legalName}-${c.source}`}>
                    <button
                      type="button"
                      onClick={() => void runResearch(c)}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-brand"
                    >
                      <span className="font-medium">{c.legalName}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {[c.uei ? `UEI ${c.uei}` : null, c.cageCode ? `CAGE ${c.cageCode}` : null, c.location, c.source]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {pendingSnapshot && showReview ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold">
                Research complete{pendingSnapshot.companyName ? ` — ${pendingSnapshot.companyName}` : ""}
              </p>
              {summary ? (
                <p className="text-sm">
                  ✓ {summary.populated} fields populated · ✓ {summary.verified} verified
                  {summary.needsReview ? ` · △ ${summary.needsReview} need review` : ""}
                  {summary.notFound ? ` · — ${summary.notFound} not found` : ""}
                </p>
              ) : null}
              {checklist ? (
                <ul className="space-y-1 text-sm">
                  <li>{checklist.companyIdentified ? "✓" : "—"} Company identified</li>
                  <li>{checklist.ueiVerified ? "✓" : "—"} UEI verified</li>
                  <li>{checklist.cageVerified ? "✓" : "—"} CAGE verified</li>
                  <li>
                    {checklist.naicsCount > 0 ? "✓" : "—"} {checklist.naicsCount} NAICS identified
                  </li>
                  <li>
                    {checklist.agencyCount > 0 ? "✓" : "—"} {checklist.agencyCount} federal agencies
                    identified
                  </li>
                  <li>
                    {checklist.vehicleCount > 0 ? "✓" : "—"} {checklist.vehicleCount} contract
                    vehicles identified
                  </li>
                  <li>{checklist.contractsFound ? "✓" : "—"} Federal contracts found</li>
                  <li>
                    {checklist.partnerFitCalculated ? "✓" : "—"} Partner fit calculated
                    {pendingSnapshot.partnerFit
                      ? ` — ${pendingSnapshot.partnerFit.priority} ${pendingSnapshot.partnerFit.score}%`
                      : ""}
                  </li>
                </ul>
              ) : null}
              {pendingSnapshot.suggestedRelationshipOwner ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmOwner}
                    onChange={(e) => setConfirmOwner(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Suggested relationship owner:{" "}
                    <strong>{pendingSnapshot.suggestedRelationshipOwner.name}</strong>
                    <span className="block text-xs text-ink-muted">
                      {pendingSnapshot.suggestedRelationshipOwner.evidence}. Confirm before
                      populating.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-xs text-ink-muted">
                  Relationship owner stays Unassigned unless you enter one.
                </p>
              )}
              <LeadConflictResolver
                conflicts={conflicts}
                decisions={decisions}
                onChange={(field, decision) =>
                  setDecisions((prev) => ({ ...prev, [field]: decision }))
                }
              />
              <button
                type="button"
                onClick={applyPendingToForm}
                className="inline-flex items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Review Profile
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

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
          + Enter details manually
        </button>
      ) : null}

      {(!quick || showDetails) ? (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Legal company name</label>
          <input
            value={values.legalCompanyName}
            onChange={(e) => setField("legalCompanyName", e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
          <LeadFieldEvidence fact={appliedFacts?.legalCompanyName} />
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
          <label className="text-sm font-medium">Headquarters</label>
          <input
            value={values.headquarters}
            onChange={(e) => setField("headquarters", e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
          <LeadFieldEvidence fact={appliedFacts?.headquarters} />
        </div>
        <div>
          <label className="text-sm font-medium">LinkedIn</label>
          <input
            value={values.linkedinUrl}
            onChange={(e) => setField("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/company/…"
            className={`mt-1 ${inputClass}`}
          />
          <LeadFieldEvidence fact={appliedFacts?.linkedinUrl} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Company description</label>
        <textarea
          value={values.companyDescription}
          onChange={(e) => setField("companyDescription", e.target.value)}
          rows={3}
          className={`mt-1 ${inputClass}`}
        />
        <LeadFieldEvidence fact={appliedFacts?.companyDescription} />
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

      {federal ? (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold">Federal partner profile</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Market / Agency</label>
              <input
                value={values.marketAgency}
                onChange={(e) => setField("marketAgency", e.target.value)}
                placeholder="Department of the Treasury"
                className={`mt-1 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.marketAgency} />
            </div>
            <div>
              <label className="text-sm font-medium">Relationship owner</label>
              <input
                value={values.relationshipOwner}
                onChange={(e) => setField("relationshipOwner", e.target.value)}
                placeholder="Unassigned"
                className={`mt-1 ${inputClass}`}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Never auto-filled from research without confirmation.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Small business status</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SMALL_BUSINESS_STATUSES.map((status) => {
                  const on = sbSelected.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? sbSelected.filter((s) => s !== status)
                          : [...sbSelected.filter((s) => s !== "Unknown"), status];
                        setField("smallBusinessStatus", next.join(", "));
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        on
                          ? "bg-brand text-white"
                          : "border border-stone-300 bg-white hover:bg-stone-50"
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
              <LeadFieldEvidence fact={appliedFacts?.smallBusinessStatuses} />
            </div>
            <div>
              <label className="text-sm font-medium">UEI</label>
              <input
                value={values.uei}
                onChange={(e) => setField("uei", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.uei} />
            </div>
            <div>
              <label className="text-sm font-medium">CAGE code</label>
              <input
                value={values.cageCode}
                onChange={(e) => setField("cageCode", e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.cageCode} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">NAICS codes</label>
              <textarea
                value={values.naicsCodes}
                onChange={(e) => setField("naicsCodes", e.target.value)}
                rows={3}
                placeholder={"541511 — Custom Computer Programming Services — PRIMARY"}
                className={`mt-1 ${inputClass}`}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                One code may be marked PRIMARY. Additional codes go on their own lines.
              </p>
              <LeadFieldEvidence fact={appliedFacts?.naics} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Primary capabilities</label>
              <LeadTagInput
                values={values.primaryCapabilities.split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean)}
                onChange={(tags) => setField("primaryCapabilities", tags.join(", "))}
                placeholder="Add a capability tag"
                suggestions={CAPABILITY_CATALOG.map((c) => c.canonical)}
              />
              <LeadFieldEvidence fact={appliedFacts?.capabilityTags} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Federal agencies served</label>
              <textarea
                value={values.federalAgenciesServed}
                onChange={(e) => setField("federalAgenciesServed", e.target.value)}
                rows={2}
                placeholder="Department of the Treasury (IRS, TTB)"
                className={`mt-1 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.agencies} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Contract vehicles</label>
              {values.researchSnapshot?.vehicles?.length ? (
                <ul className="mt-2 space-y-2">
                  {values.researchSnapshot.vehicles.map((v) => (
                    <li
                      key={`${v.name}-${v.contractNumber}`}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{v.name}</p>
                      <p className="text-xs text-ink-muted">
                        {[v.contractNumber, v.vehicleType, v.awardingAgency, v.status]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <textarea
                value={values.contractVehicles}
                onChange={(e) => setField("contractVehicles", e.target.value)}
                rows={2}
                placeholder="Only verified vehicles"
                className={`mt-2 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.vehicles} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Known contracts</label>
              {values.researchSnapshot?.contracts?.length ? (
                <ul className="mt-2 space-y-2">
                  {values.researchSnapshot.contracts.slice(0, 8).map((c) => (
                    <li
                      key={`${c.contractNumber}-${c.name}`}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{c.name || c.contractNumber}</p>
                      <p className="text-xs text-ink-muted">
                        {[c.contractNumber, c.agency, c.role, c.contractType, c.status]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <textarea
                value={values.knownContracts}
                onChange={(e) => setField("knownContracts", e.target.value)}
                rows={2}
                placeholder="Only verified awards"
                className={`mt-2 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.contracts} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Current opportunities</label>
              {values.researchSnapshot &&
              values.researchSnapshot.opportunitiesVerified &&
              values.researchSnapshot.opportunities.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">
                  No current opportunities verified
                </p>
              ) : null}
              {values.researchSnapshot?.opportunities?.map((o) => (
                <div
                  key={o.noticeNumber || o.title}
                  className="mt-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                >
                  <p className="font-medium">{o.title}</p>
                  <p className="text-xs text-ink-muted">
                    {[o.noticeNumber, o.agency, o.dueDate, o.setAside]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {o.sourceUrl ? (
                    <a
                      href={o.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand hover:underline"
                    >
                      Source
                    </a>
                  ) : null}
                </div>
              ))}
              <textarea
                value={values.currentOpportunities}
                onChange={(e) => setField("currentOpportunities", e.target.value)}
                rows={2}
                className={`mt-2 ${inputClass}`}
              />
              <LeadFieldEvidence fact={appliedFacts?.opportunities} />
            </div>
            <div>
              <label className="text-sm font-medium">Past performance areas</label>
              <LeadTagInput
                values={values.pastPerformanceAreas.split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean)}
                onChange={(tags) => setField("pastPerformanceAreas", tags.join(", "))}
                suggestions={PAST_PERFORMANCE_TAGS}
              />
              <LeadFieldEvidence fact={appliedFacts?.pastPerformanceTags} />
            </div>
            <div>
              <label className="text-sm font-medium">Technology areas</label>
              <LeadTagInput
                values={values.technologyAreas.split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean)}
                onChange={(tags) => setField("technologyAreas", tags.join(", "))}
                suggestions={TECHNOLOGY_CATALOG.map((t) => t.canonical)}
              />
              <LeadFieldEvidence fact={appliedFacts?.technologyTags} />
            </div>
          </div>
        </div>
      ) : null}

      {values.researchSnapshot?.partnerFit || values.whyCompanyMatters ? (
        <LeadPartnerFitCard
          fit={
            values.researchSnapshot?.partnerFit ?? {
              score: 0,
              priority: "Low",
              relationshipType: "",
              whyCompanyMatters: values.whyCompanyMatters,
              nm2techCanBring: values.nm2techCanBring.split(",").map((s) => s.trim()).filter(Boolean),
              outreachAngle: values.recommendedOutreachAngle,
              signals: [],
            }
          }
        />
      ) : null}
        </>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || researching || Boolean(pendingSnapshot)}
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
      {pendingSnapshot ? (
        <p className="text-xs text-ink-muted">
          Review the research results and click Review Profile before saving.
        </p>
      ) : null}
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
