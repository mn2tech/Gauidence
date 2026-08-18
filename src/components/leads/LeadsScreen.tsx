"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import LeadForm, {
  resolveSourceForApi,
  type LeadFormValues,
} from "@/components/leads/LeadForm";
import LeadCardScanModal from "@/components/leads/LeadCardScanModal";
import LeadDuplicateDialog from "@/components/leads/LeadDuplicateDialog";
import LeadImportModal from "@/components/leads/LeadImportModal";
import LeadContactsPanel from "@/components/leads/LeadContactsPanel";
import LeadDocumentsCard from "@/components/leads/LeadDocumentsCard";
import LeadFederalProfile from "@/components/leads/LeadFederalProfile";
import LeadInsightsCard from "@/components/leads/LeadInsightsCard";
import LeadInteractionForm from "@/components/leads/LeadInteractionForm";
import LeadOpportunitiesPanel from "@/components/leads/LeadOpportunitiesPanel";
import LeadOpportunityBriefCard from "@/components/leads/LeadOpportunityBriefCard";
import LeadOutreachPanel from "@/components/leads/LeadOutreachPanel";
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";
import LeadTypeBadge from "@/components/leads/LeadTypeBadge";
import {
  applyLeadListFilters,
  computeLeadSummary,
  leadContactLine,
  leadDisplayName,
  leadTypeOf,
  stagesForLeadType,
  todaysActionBreakdown,
  todaysActionLeads,
  LEAD_ACTIVITY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TYPE_LABELS,
  SMALL_BUSINESS_STATUSES,
  type BusinessLead,
  type LeadStatus,
  type LeadType,
  type LeadWithActivities,
} from "@/lib/leads/types";
import { isOrgStyleProfile, isProfileOwner } from "@/lib/profiles/types";
import { LEADS_PATH, PROPOSALS_PATH } from "@/lib/routes";

const cardClass = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";
const buttonSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-stone-50 disabled:opacity-50";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function leadToFormValues(lead: BusinessLead): Partial<LeadFormValues> {
  const isKnownSource =
    lead.source &&
    ["Business Card", "Event", "Chamber", "Referral", "Website", "Excel Import", "Other", "Networking Event", "SAM.gov", "LinkedIn", "Company Website", "Existing Relationship", "Manual"].includes(
      lead.source
    );
  return {
    leadType: leadTypeOf(lead),
    companyName: lead.company_name ?? "",
    contactName: lead.contact_name ?? "",
    jobTitle: lead.job_title ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    source: isKnownSource ? lead.source! : lead.source ? "Other" : "",
    customSource: isKnownSource ? "" : lead.source ?? "",
    sourceDetail: lead.source_detail ?? "",
    notes: lead.notes ?? "",
    linkedinUrl: lead.linkedin_url ?? "",
    relationshipOwner: lead.relationship_owner ?? "",
    smallBusinessStatus: lead.small_business_status ?? "",
    uei: lead.uei ?? "",
    cageCode: lead.cage_code ?? "",
    naicsCodes: lead.naics_codes ?? "",
    primaryCapabilities: lead.primary_capabilities ?? "",
    federalAgenciesServed: lead.federal_agencies_served ?? "",
    contractVehicles: lead.contract_vehicles ?? "",
    knownContracts: lead.known_contracts ?? "",
    currentOpportunities: lead.current_opportunities ?? "",
    pastPerformanceAreas: lead.past_performance_areas ?? "",
    technologyAreas: lead.technology_areas ?? "",
    marketAgency: lead.market_agency ?? "",
  };
}

function leadProfilePayload(values: LeadFormValues) {
  return {
    linkedinUrl: values.linkedinUrl.trim() || null,
    relationshipOwner: values.relationshipOwner.trim() || null,
    smallBusinessStatus: values.smallBusinessStatus.trim() || null,
    uei: values.uei.trim() || null,
    cageCode: values.cageCode.trim() || null,
    naicsCodes: values.naicsCodes.trim() || null,
    primaryCapabilities: values.primaryCapabilities.trim() || null,
    federalAgenciesServed: values.federalAgenciesServed.trim() || null,
    contractVehicles: values.contractVehicles.trim() || null,
    knownContracts: values.knownContracts.trim() || null,
    currentOpportunities: values.currentOpportunities.trim() || null,
    pastPerformanceAreas: values.pastPerformanceAreas.trim() || null,
    technologyAreas: values.technologyAreas.trim() || null,
    marketAgency: values.marketAgency.trim() || null,
  };
}

export default function LeadsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const { active } = useActiveProfile();

  const isBusiness =
    active != null &&
    isOrgStyleProfile(active.profile_type) &&
    active.profile_type !== "client";
  const businessProfileId = isBusiness ? active?.id ?? null : null;
  const canDeleteLeads = isBusiness && active != null && isProfileOwner(active);

  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadWithActivities | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<LeadType | "all">("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [addLeadType, setAddLeadType] = useState<LeadType>("commercial");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [naicsFilter, setNaicsFilter] = useState("");
  const [sbFilter, setSbFilter] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState("");
  const [minMatch, setMinMatch] = useState<number | "all">("all");
  const [needsFollowUpFilter, setNeedsFollowUpFilter] = useState(false);
  const [hasOpportunityFilter, setHasOpportunityFilter] = useState(false);
  const [lastContactFilter, setLastContactFilter] = useState<"all" | "30">("all");
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [nextActionDateDraft, setNextActionDateDraft] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [analyzingOpportunity, setAnalyzingOpportunity] = useState(false);
  const [opportunityError, setOpportunityError] = useState<string | null>(null);
  const [draftingOutreach, setDraftingOutreach] = useState(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<
    Array<{ lead: BusinessLead; reasons: string[] }> | null
  >(null);
  const [pendingCreatePayload, setPendingCreatePayload] = useState<
    Record<string, unknown> | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const summary = useMemo(() => computeLeadSummary(leads), [leads]);
  const todayBreakdown = useMemo(() => todaysActionBreakdown(leads), [leads]);
  const visibleLeads = useMemo(() => {
    const scoped = todayOnly ? todaysActionLeads(leads) : leads;
    return applyLeadListFilters(scoped, {
      agency: agencyFilter,
      naics: naicsFilter,
      sbStatus: sbFilter,
      capability: capabilityFilter,
      minMatch: minMatch === "all" ? null : minMatch,
      needsFollowUp: needsFollowUpFilter,
      hasOpportunity: hasOpportunityFilter,
      lastContactDays: lastContactFilter === "30" ? 30 : null,
    });
  }, [
    leads,
    todayOnly,
    agencyFilter,
    naicsFilter,
    sbFilter,
    capabilityFilter,
    minMatch,
    needsFollowUpFilter,
    hasOpportunityFilter,
    lastContactFilter,
  ]);

  const loadLeads = useCallback(async () => {
    if (!businessProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ businessProfileId });
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (typeFilter !== "all") q.set("leadType", typeFilter);
      if (search.trim()) q.set("q", search.trim());
      const res = await fetch(`/api/leads?${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load leads.");
      setLeads(body.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load leads.");
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, search, statusFilter, typeFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load lead.");
      setSelectedLead(body.lead ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load lead.");
      setSelectedLead(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setSelectedLead(null);
      setEditing(false);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!selectedLead) return;
    setNextActionDraft(selectedLead.next_action ?? "");
    setNextActionDateDraft(selectedLead.next_action_date ?? "");
  }, [selectedLead]);

  async function submitCreateLead(
    payload: Record<string, unknown>,
    forceCreate = false
  ) {
    if (!businessProfileId) return;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, forceCreate }),
    });
    const body = await res.json();

    if (res.status === 409 && body.duplicates) {
      setPendingCreatePayload(payload);
      setPendingDuplicates(body.duplicates as Array<{
        lead: BusinessLead;
        reasons: string[];
      }>);
      return null;
    }

    if (!res.ok || !body.lead) {
      throw new Error(body.error ?? "Couldn't create lead.");
    }

    setShowAddForm(false);
    setLeads((prev) => [body.lead, ...prev]);
    router.push(`${LEADS_PATH}?id=${body.lead.id}`);
    return body.lead as BusinessLead;
  }

  async function handleCreateLead(values: LeadFormValues) {
    if (!businessProfileId) return;
    const payload = {
      businessProfileId,
      leadType: values.leadType,
      companyName: values.companyName.trim() || null,
      contactName: values.contactName.trim() || null,
      jobTitle: values.jobTitle.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      website: values.website.trim() || null,
      source: resolveSourceForApi(values),
      sourceDetail: values.sourceDetail.trim() || null,
      notes: values.notes.trim() || null,
      ...leadProfilePayload(values),
    };
    await submitCreateLead(payload);
  }

  async function handleForceCreate() {
    if (!pendingCreatePayload) return;
    setDuplicateBusy(true);
    try {
      await submitCreateLead(pendingCreatePayload, true);
      setPendingDuplicates(null);
      setPendingCreatePayload(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create lead.");
    } finally {
      setDuplicateBusy(false);
    }
  }

  function handleScanDuplicate(args: {
    payload: Record<string, unknown>;
    duplicates: Array<{ lead: unknown; reasons: string[] }>;
  }) {
    setPendingCreatePayload(args.payload);
    setPendingDuplicates(
      args.duplicates as Array<{ lead: BusinessLead; reasons: string[] }>
    );
  }

  async function handleUpdateLead(values: LeadFormValues) {
    if (!selectedId) return;
    const res = await fetch(`/api/leads/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: values.companyName.trim() || null,
        contactName: values.contactName.trim() || null,
        jobTitle: values.jobTitle.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        website: values.website.trim() || null,
        source: resolveSourceForApi(values),
        sourceDetail: values.sourceDetail.trim() || null,
        notes: values.notes.trim() || null,
        leadType: values.leadType,
        ...leadProfilePayload(values),
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.lead) {
      throw new Error(body.error ?? "Couldn't update lead.");
    }
    setEditing(false);
    setSelectedLead(body.lead);
    setLeads((prev) =>
      prev.map((l) => (l.id === body.lead.id ? body.lead : l))
    );
  }

  async function handleDraftOutreach() {
    if (!selectedId) return;
    setDraftingOutreach(true);
    setOutreachError(null);
    try {
      const res = await fetch(`/api/leads/${selectedId}/draft-outreach`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Couldn't draft outreach."
        );
      }
      if (body.lead) {
        setSelectedLead(body.lead as LeadWithActivities);
        setLeads((prev) =>
          prev.map((l) =>
            l.id === body.lead.id ? (body.lead as BusinessLead) : l
          )
        );
      } else {
        await loadDetail(selectedId);
      }
    } catch (err) {
      setOutreachError(
        err instanceof Error ? err.message : "Couldn't draft outreach."
      );
    } finally {
      setDraftingOutreach(false);
    }
  }

  async function handleCreateProposal() {
    if (!selectedId) return;
    setCreatingProposal(true);
    setProposalError(null);
    try {
      const res = await fetch(`/api/leads/${selectedId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Couldn't create proposal."
        );
      }
      if (body.lead) {
        setSelectedLead(body.lead as LeadWithActivities);
        setLeads((prev) =>
          prev.map((l) =>
            l.id === body.lead.id ? (body.lead as BusinessLead) : l
          )
        );
      } else {
        await loadDetail(selectedId);
      }
      if (body.proposalId) {
        router.push(`${PROPOSALS_PATH}?id=${body.proposalId}`);
      }
    } catch (err) {
      setProposalError(
        err instanceof Error ? err.message : "Couldn't create proposal."
      );
    } finally {
      setCreatingProposal(false);
    }
  }

  async function handleFindOpportunity() {
    if (!selectedId) return;
    setAnalyzingOpportunity(true);
    setOpportunityError(null);
    try {
      const res = await fetch(`/api/leads/${selectedId}/analyze`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Couldn't analyze this lead."
        );
      }
      if (body.lead) {
        setSelectedLead(body.lead as LeadWithActivities);
        setLeads((prev) =>
          prev.map((l) =>
            l.id === body.lead.id ? (body.lead as BusinessLead) : l
          )
        );
      } else {
        await loadDetail(selectedId);
      }
    } catch (err) {
      setOpportunityError(
        err instanceof Error ? err.message : "Couldn't analyze this lead."
      );
    } finally {
      setAnalyzingOpportunity(false);
    }
  }

  async function handleStatusChange(status: LeadStatus) {
    if (!selectedId || !selectedLead) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/leads/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok || !body.lead) {
        throw new Error(body.error ?? "Couldn't update status.");
      }
      setSelectedLead(body.lead);
      setLeads((prev) =>
        prev.map((l) => (l.id === body.lead.id ? body.lead : l))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSaveNextAction() {
    if (!selectedId) return;
    const res = await fetch(`/api/leads/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nextAction: nextActionDraft.trim() || null,
        nextActionDate: nextActionDateDraft || null,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.lead) {
      throw new Error(body.error ?? "Couldn't save next action.");
    }
    setSelectedLead(body.lead);
    setLeads((prev) =>
      prev.map((l) => (l.id === body.lead.id ? body.lead : l))
    );
  }

  async function handleApproveOutreach() {
    if (!selectedId) return;
    await fetch(`/api/leads/${selectedId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityType: "outreach_drafted",
        description: "Outreach approved for manual send",
      }),
    });
    await loadDetail(selectedId);
  }

  async function handleDeleteLead(lead: BusinessLead) {
    const name = leadDisplayName(lead);
    const confirmed = window.confirm(
      `Delete "${name}"? Contacts and activity for this company will be removed. This can't be undone.`
    );
    if (!confirmed) return;

    setDeletingId(lead.id);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Couldn't delete lead."
        );
      }
      setLeads((prev) => prev.filter((item) => item.id !== lead.id));
      if (selectedId === lead.id) {
        setSelectedLead(null);
        setEditing(false);
        router.push(LEADS_PATH);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete lead.");
    } finally {
      setDeletingId(null);
    }
  }

  function recommendNextAction() {
    if (!selectedLead) return;
    const type = leadTypeOf(selectedLead);
    const suggestion =
      type === "federal_partner"
        ? "Request a 20-minute capability discussion as a data/AI subcontracting partner."
        : selectedLead.next_action?.trim() ||
          "Send a short introduction and propose a 15-minute call.";
    setNextActionDraft(suggestion);
    if (!nextActionDateDraft) {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      setNextActionDateDraft(d.toISOString().slice(0, 10));
    }
  }

  function renderOverlayModals() {
    return (
      <>
        {businessProfileId ? (
          <>
            <LeadCardScanModal
              businessProfileId={businessProfileId}
              ownerUserId={active?.owner_user_id}
              open={showScanModal}
              onClose={() => setShowScanModal(false)}
              onCreated={(lead) => {
                const l = lead as BusinessLead;
                setLeads((prev) => [l, ...prev]);
                router.push(`${LEADS_PATH}?id=${l.id}`);
              }}
              onDuplicate={handleScanDuplicate}
            />
            <LeadImportModal
              businessProfileId={businessProfileId}
              open={showImportModal}
              onClose={() => setShowImportModal(false)}
              onImported={() => void loadLeads()}
            />
          </>
        ) : null}

        {pendingDuplicates && pendingDuplicates.length > 0 ? (
          <LeadDuplicateDialog
            duplicates={pendingDuplicates}
            busy={duplicateBusy}
            onUseExisting={(leadId) => {
              setPendingDuplicates(null);
              setPendingCreatePayload(null);
              router.push(`${LEADS_PATH}?id=${leadId}`);
            }}
            onCreateAnyway={() => void handleForceCreate()}
            onCancel={() => {
              setPendingDuplicates(null);
              setPendingCreatePayload(null);
            }}
          />
        ) : null}
      </>
    );
  }

  if (!isBusiness) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-bold tracking-tight">Leads</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Switch to a business workspace to track leads and opportunities.
        </p>
        <Link href="/vaults" className="mt-4 text-sm font-medium text-brand hover:underline">
          Go to Spaces
        </Link>
      </div>
    );
  }

  if (selectedId && (detailLoading || selectedLead)) {
    const lead = selectedLead;
    return (
      <>
      <div>
        <Link
          href={LEADS_PATH}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All leads
        </Link>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {detailLoading && !lead ? (
          <p className="mt-6 text-sm text-ink-muted">Loading lead…</p>
        ) : lead ? (
          <div className="mt-6 space-y-6">
            <div className={cardClass}>
              {editing ? (
                <>
                  <h2 className="font-semibold">Edit lead</h2>
                  <div className="mt-4">
                    <LeadForm
                      initialValues={leadToFormValues(lead)}
                      onSubmit={handleUpdateLead}
                      onCancel={() => setEditing(false)}
                      submitLabel="Save changes"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">
                          {leadDisplayName(lead)}
                        </h1>
                        <LeadTypeBadge type={leadTypeOf(lead)} />
                      </div>
                      {leadContactLine(lead) ? (
                        <p className="mt-1 text-sm text-ink-muted">
                          {leadContactLine(lead)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadStatusBadge status={lead.status} />
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Edit
                      </button>
                      {canDeleteLeads ? (
                        <button
                          type="button"
                          disabled={deletingId === lead.id}
                          onClick={() => void handleDeleteLead(lead)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-700 hover:underline disabled:opacity-50"
                        >
                          {deletingId === lead.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    {lead.email ? (
                      <p>
                        <span className="text-ink-muted">Email: </span>
                        <a href={`mailto:${lead.email}`} className="text-brand hover:underline">
                          {lead.email}
                        </a>
                      </p>
                    ) : null}
                    {lead.phone ? (
                      <p>
                        <span className="text-ink-muted">Phone: </span>
                        {lead.phone}
                      </p>
                    ) : null}
                    {lead.website ? (
                      <p>
                        <span className="text-ink-muted">Website: </span>
                        {lead.website}
                      </p>
                    ) : null}
                    {lead.source ? (
                      <p>
                        <span className="text-ink-muted">Source: </span>
                        {lead.source}
                        {lead.source_detail ? ` · ${lead.source_detail}` : ""}
                      </p>
                    ) : null}
                    {lead.relationship_owner ? (
                      <p>
                        <span className="text-ink-muted">Owner: </span>
                        {lead.relationship_owner}
                      </p>
                    ) : null}
                    {lead.linkedin_url && lead.lead_type !== "federal_partner" ? (
                      <p>
                        <span className="text-ink-muted">LinkedIn: </span>
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline"
                        >
                          Profile
                        </a>
                      </p>
                    ) : null}
                  </div>

                  <LeadFederalProfile lead={lead} />

                  <div className="mt-4">
                    <label className="text-sm font-medium">Stage</label>
                    <select
                      value={lead.status}
                      disabled={savingStatus}
                      onChange={(e) =>
                        void handleStatusChange(e.target.value as LeadStatus)
                      }
                      className={`mt-1 max-w-xs ${inputClass}`}
                    >
                      {stagesForLeadType(leadTypeOf(lead), lead.status).map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 rounded-xl border border-brand/20 bg-brand-light/30 p-4">
                    <p className="text-sm font-semibold">Next action</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Who should you contact, and why?
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={nextActionDraft}
                        onChange={(e) => setNextActionDraft(e.target.value)}
                        placeholder="No next action"
                        className={inputClass}
                      />
                      <input
                        type="date"
                        value={nextActionDateDraft}
                        onChange={(e) => setNextActionDateDraft(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveNextAction()}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Save next action
                      </button>
                      <button
                        type="button"
                        onClick={recommendNextAction}
                        className="text-sm font-medium text-ink-muted hover:underline"
                      >
                        Suggest one
                      </button>
                    </div>
                  </div>

                  {lead.match_explanation || lead.recommended_approach ? (
                    <div className="mt-4 space-y-2 text-sm">
                      {lead.match_explanation ? (
                        <p>
                          <span className="font-medium">Why this matches NM2TECH: </span>
                          <span className="text-ink-muted">{lead.match_explanation}</span>
                        </p>
                      ) : null}
                      {lead.recommended_approach ? (
                        <p>
                          <span className="font-medium">Recommended approach: </span>
                          <span className="text-ink-muted">{lead.recommended_approach}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {lead.notes ? (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                        Notes
                      </h3>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {!editing && selectedLead ? (
              <>
                <LeadOpportunityBriefCard
                  lead={selectedLead}
                  analyzing={analyzingOpportunity}
                  error={opportunityError}
                  onAnalyze={() => void handleFindOpportunity()}
                  creatingProposal={creatingProposal}
                  proposalError={proposalError}
                  onCreateProposal={() => void handleCreateProposal()}
                />
                <LeadOutreachPanel
                  lead={selectedLead}
                  drafting={draftingOutreach}
                  error={outreachError}
                  onDraft={() => void handleDraftOutreach()}
                  onApproved={() => handleApproveOutreach()}
                />
                <LeadContactsPanel
                  leadId={selectedLead.id}
                  contacts={selectedLead.contacts ?? []}
                  onChanged={() => loadDetail(selectedLead.id)}
                />
                <LeadOpportunitiesPanel
                  leadId={selectedLead.id}
                  opportunities={selectedLead.opportunities ?? []}
                  onChanged={() => loadDetail(selectedLead.id)}
                />
                {selectedLead.proposal_id ? (
                  <div className={cardClass}>
                    <h2 className="font-semibold">Proposals</h2>
                    <Link
                      href={`${PROPOSALS_PATH}?id=${selectedLead.proposal_id}`}
                      className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                    >
                      Open related proposal
                    </Link>
                  </div>
                ) : null}
                <LeadDocumentsCard lead={selectedLead} />
                <LeadInsightsCard lead={selectedLead} />
              </>
            ) : null}

            {!editing && lead ? (
              <div className={cardClass}>
                <h2 className="font-semibold">Activity</h2>
                <LeadInteractionForm
                  leadId={lead.id}
                  contacts={lead.contacts ?? []}
                  onLogged={() => loadDetail(lead.id)}
                />
                {lead.activities.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span className="shrink-0 text-ink-muted">
                        {formatDate(a.occurred_at ?? a.created_at)}
                      </span>
                      <span>
                        {a.description ??
                          LEAD_ACTIVITY_LABELS[a.activity_type] ??
                          a.activity_type}
                      </span>
                    </li>
                  ))}
                </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">No interactions yet.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {renderOverlayModals()}
    </>
    );
  }

  return (
    <>
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Who needs your attention today — commercial leads and federal partners
            in one pipeline.
          </p>
        </div>
      </div>

      {leads.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: "Total", value: summary.total },
            { label: "Commercial", value: summary.commercial },
            { label: "Federal Partners", value: summary.federal },
            { label: "Need follow-up", value: summary.needFollowUp },
            { label: "Meetings", value: summary.meetings },
            { label: "Proposals", value: summary.proposals },
            { label: "Opportunities", value: summary.activeOpportunities },
            { label: "Active partners", value: summary.activePartners },
          ].map((item) => (
            <div key={item.label} className={`${cardClass} !p-4 text-center`}>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-sm text-ink-muted">
          Add Lead: scan a card, add manually, import a list, or add a federal partner.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setAddLeadType("commercial");
            setShowAddForm(true);
            setShowScanModal(false);
            setShowImportModal(false);
          }}
          className={buttonPrimary}
        >
          <Plus className="h-4 w-4" />
          Add Lead
        </button>
        <button
          type="button"
          onClick={() => {
            setAddLeadType("federal_partner");
            setShowAddForm(true);
          }}
          className={buttonSecondary}
        >
          Add Federal Partner
        </button>
        <button
          type="button"
          onClick={() => setShowScanModal(true)}
          className={buttonSecondary}
        >
          <CreditCard className="h-4 w-4" />
          Scan Business Card
        </button>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className={buttonSecondary}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Import Excel/CSV
        </button>
      </div>

      {showAddForm ? (
        <div className={`mt-6 ${cardClass}`}>
          <h2 className="font-semibold">
            {addLeadType === "federal_partner" ? "Add federal partner" : "Add lead"}
          </h2>
          <div className="mt-4">
            <LeadForm
              key={addLeadType}
              quick
              initialValues={{ leadType: addLeadType }}
              onSubmit={handleCreateLead}
              onCancel={() => setShowAddForm(false)}
              submitLabel="Save lead"
            />
          </div>
        </div>
      ) : null}

      {leads.length > 0 || typeFilter !== "all" || todayOnly ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, agency…"
              className={`pl-9 ${inputClass}`}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LeadType | "all")}
            className={`max-w-[180px] ${inputClass}`}
          >
            <option value="all">All types</option>
            <option value="commercial">{LEAD_TYPE_LABELS.commercial}</option>
            <option value="federal_partner">{LEAD_TYPE_LABELS.federal_partner}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className={`max-w-[180px] ${inputClass}`}
          >
            <option value="all">All stages</option>
            {(typeFilter === "all"
              ? Array.from(
                  new Set([
                    ...stagesForLeadType("commercial"),
                    ...stagesForLeadType("federal_partner"),
                  ])
                )
              : stagesForLeadType(typeFilter)
            ).map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setTodayOnly((v) => !v)}
            className={todayOnly ? buttonPrimary : buttonSecondary}
          >
            Today&apos;s actions
          </button>
        </div>
      ) : null}

      {typeFilter !== "commercial" && (leads.length > 0 || typeFilter === "federal_partner") ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            placeholder="Agency"
            className={`max-w-[140px] ${inputClass}`}
          />
          <input
            value={naicsFilter}
            onChange={(e) => setNaicsFilter(e.target.value)}
            placeholder="NAICS"
            className={`max-w-[120px] ${inputClass}`}
          />
          <select
            value={sbFilter}
            onChange={(e) => setSbFilter(e.target.value)}
            className={`max-w-[160px] ${inputClass}`}
          >
            <option value="">All SB status</option>
            {SMALL_BUSINESS_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            value={capabilityFilter}
            onChange={(e) => setCapabilityFilter(e.target.value)}
            placeholder="Capability"
            className={`max-w-[140px] ${inputClass}`}
          />
          <select
            value={minMatch === "all" ? "all" : String(minMatch)}
            onChange={(e) =>
              setMinMatch(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className={`max-w-[140px] ${inputClass}`}
          >
            <option value="all">Any match</option>
            <option value="50">Match 50+</option>
            <option value="70">Match 70+</option>
          </select>
          <select
            value={lastContactFilter}
            onChange={(e) => setLastContactFilter(e.target.value as "all" | "30")}
            className={`max-w-[180px] ${inputClass}`}
          >
            <option value="all">Any last contact</option>
            <option value="30">No contact 30+ days</option>
          </select>
          <button
            type="button"
            onClick={() => setNeedsFollowUpFilter((v) => !v)}
            className={needsFollowUpFilter ? buttonPrimary : buttonSecondary}
          >
            Needs follow-up
          </button>
          <button
            type="button"
            onClick={() => setHasOpportunityFilter((v) => !v)}
            className={hasOpportunityFilter ? buttonPrimary : buttonSecondary}
          >
            Opportunity
          </button>
        </div>
      ) : null}

      {todayOnly ? (
        <div className={`mt-4 ${cardClass}`}>
          <p className="text-sm font-semibold">Today</p>
          <p className="mt-2 text-sm text-ink-muted">
            Federal Partners — {todayBreakdown.federal} · Commercial Leads —{" "}
            {todayBreakdown.commercial} · Proposal Follow-Ups —{" "}
            {todayBreakdown.proposals} · Meetings — {todayBreakdown.meetings}
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-8 text-sm text-ink-muted">
          <Loader2 className="inline h-4 w-4 animate-spin" /> Loading leads…
        </p>
      ) : leads.length === 0 && !showAddForm ? (
        <div className={`mt-8 ${cardClass} text-center`}>
          <UserPlus className="mx-auto h-10 w-10 text-brand" />
          <h2 className="mt-4 text-lg font-semibold">
            Turn connections into opportunities.
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Add a business card or import a business list. Gideon can research the
            company, identify potential opportunities, and help you decide what to do
            next.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowScanModal(true)}
              className={buttonSecondary}
            >
              <CreditCard className="h-4 w-4" />
              Scan Business Card
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className={buttonSecondary}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Business List
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className={buttonPrimary}
            >
              <Plus className="h-4 w-4" />
              Add one lead
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Primary contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Market / Agency</th>
                <th className="px-4 py-3 font-medium">Match</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Last contact</th>
                <th className="px-4 py-3 font-medium">Next action</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                {canDeleteLeads ? (
                  <th className="px-4 py-3 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visibleLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`${LEADS_PATH}?id=${lead.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {lead.company_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.contact_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LeadTypeBadge type={leadTypeOf(lead)} />
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-3 text-ink-muted">
                    {lead.market_agency ?? lead.federal_agencies_served ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.lead_score != null ? `${lead.lead_score}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatDate(lead.last_contact_at ?? lead.last_activity_at ?? lead.updated_at)}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-ink-muted">
                    {lead.next_action?.trim()
                      ? `${lead.next_action}${lead.next_action_date ? ` · ${formatDate(lead.next_action_date)}` : ""}`
                      : "No Next Action"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.relationship_owner ?? "—"}
                  </td>
                  {canDeleteLeads ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={deletingId === lead.id}
                        onClick={() => void handleDeleteLead(lead)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 hover:underline disabled:opacity-50"
                      >
                        {deletingId === lead.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleLeads.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              {todayOnly
                ? "Nothing due today. Open a lead to set a next action."
                : "No leads match your filters."}
            </p>
          ) : null}
        </div>
      )}
    </div>

    {renderOverlayModals()}
  </>
  );
}
