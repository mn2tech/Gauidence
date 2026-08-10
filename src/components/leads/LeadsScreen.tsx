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
  Sparkles,
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
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";
import {
  computeLeadSummary,
  leadContactLine,
  leadDisplayName,
  LEAD_ACTIVITY_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type BusinessLead,
  type LeadStatus,
  type LeadWithActivities,
} from "@/lib/leads/types";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { LEADS_PATH } from "@/lib/routes";

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
    ["Business Card", "Event", "Chamber", "Referral", "Website", "Excel Import", "Other"].includes(
      lead.source
    );
  return {
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

  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadWithActivities | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<
    Array<{ lead: BusinessLead; reasons: string[] }>
  > | null>(null);
  const [pendingCreatePayload, setPendingCreatePayload] = useState<
    Record<string, unknown> | null
  >(null);

  const summary = useMemo(() => computeLeadSummary(leads), [leads]);

  const loadLeads = useCallback(async () => {
    if (!businessProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ businessProfileId });
      if (statusFilter !== "all") q.set("status", statusFilter);
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
  }, [businessProfileId, search, statusFilter]);

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
      companyName: values.companyName.trim() || null,
      contactName: values.contactName.trim() || null,
      jobTitle: values.jobTitle.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      website: values.website.trim() || null,
      source: resolveSourceForApi(values),
      sourceDetail: values.sourceDetail.trim() || null,
      notes: values.notes.trim() || null,
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
                      <h1 className="text-2xl font-bold tracking-tight">
                        {leadDisplayName(lead)}
                      </h1>
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
                  </div>

                  <div className="mt-4">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      value={lead.status}
                      disabled={savingStatus}
                      onChange={(e) =>
                        void handleStatusChange(e.target.value as LeadStatus)
                      }
                      className={`mt-1 max-w-xs ${inputClass}`}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>

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

            {!editing && (
              <div className={cardClass}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand" />
                  <h2 className="font-semibold">AI Opportunity Brief</h2>
                </div>
                <p className="mt-3 text-sm text-ink-muted">
                  Use Find Opportunity to let Gideon research this company and suggest
                  what to do next. Coming in Phase 3.
                </p>
                <button
                  type="button"
                  disabled
                  className={`mt-4 ${buttonSecondary}`}
                >
                  <Sparkles className="h-4 w-4" />
                  Find Opportunity
                </button>
              </div>
            )}

            {!editing && lead.activities.length > 0 ? (
              <div className={cardClass}>
                <h2 className="font-semibold">Activity</h2>
                <ul className="mt-4 space-y-3">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span className="shrink-0 text-ink-muted">
                        {formatDate(a.created_at)}
                      </span>
                      <span>
                        {a.description ??
                          LEAD_ACTIVITY_LABELS[a.activity_type] ??
                          a.activity_type}
                      </span>
                    </li>
                  ))}
                </ul>
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
            Turn connections into opportunities. Add contacts, then let Gideon help
            you understand which ones matter and what to do next.
          </p>
        </div>
      </div>

      {leads.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total", value: summary.total },
            { label: "New", value: summary.new },
            { label: "Contacted", value: summary.contacted },
            { label: "Interested", value: summary.interested },
            { label: "Proposal", value: summary.proposal },
            { label: "Won", value: summary.won },
          ].map((item) => (
            <div key={item.label} className={`${cardClass} !p-4 text-center`}>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-sm text-ink-muted">
        <strong className="font-medium text-foreground">One contact:</strong> Add Lead or scan a card.
        <strong className="font-medium text-foreground"> Many contacts:</strong> Import Excel/CSV.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setShowAddForm(true);
            setShowScanModal(false);
            setShowImportModal(false);
          }}
          className={buttonPrimary}
        >
          <Plus className="h-4 w-4" />
          Add one lead
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
          <h2 className="font-semibold">Add one lead</h2>
          <div className="mt-4">
            <LeadForm
              quick
              onSubmit={handleCreateLead}
              onCancel={() => setShowAddForm(false)}
              submitLabel="Save lead"
            />
          </div>
        </div>
      ) : null}

      {leads.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className={`pl-9 ${inputClass}`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className={`max-w-[180px] ${inputClass}`}
          >
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
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
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Opportunity</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Activity</th>
                <th className="px-4 py-3 font-medium">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {leads.map((lead) => (
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
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.source ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-ink-muted">
                    {lead.opportunity_summary ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.lead_score != null ? `${lead.lead_score}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatDate(lead.last_activity_at ?? lead.updated_at)}
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-3 text-ink-muted">
                    {lead.next_action ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No leads match your filters.
            </p>
          ) : null}
        </div>
      )}
    </div>

    {renderOverlayModals()}
  </>
  );
}
