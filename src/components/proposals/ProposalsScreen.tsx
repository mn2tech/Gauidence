"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  FileText,
  Loader2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import ProposalStatusBadge from "@/components/proposals/ProposalStatusBadge";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  type ProposalAnalytics,
  type ProposalStatus,
  type ProposalTemplate,
  type ProposalWithMeta,
  type ServiceTemplate,
} from "@/lib/proposals/types";
import { activeClientsOf, isOrgStyleProfile } from "@/lib/profiles/types";
import { formatMoney } from "@/lib/proposals/pricing";
import { PROPOSALS_PATH } from "@/lib/routes";

type Tab = "dashboard" | "templates" | "services";

type BuilderLineItem = {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unitLabel: string;
  unitPriceCents: number;
  optional?: boolean;
};

type TimelineItem = {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  sortOrder: number;
};

type DeliverableItem = {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
};

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";
const cardClass = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";

export default function ProposalsScreen() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const { active, profiles } = useActiveProfile();

  const isBusiness =
    active != null &&
    isOrgStyleProfile(active.profile_type) &&
    active.profile_type !== "client";
  const businessProfileId = isBusiness ? active?.id ?? null : null;
  const clients = useMemo(
    () => (active ? activeClientsOf(profiles, active.id) : []),
    [active, profiles]
  );

  const [tab, setTab] = useState<Tab>("dashboard");
  const [proposals, setProposals] = useState<ProposalWithMeta[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [services, setServices] = useState<ServiceTemplate[]>([]);
  const [analytics, setAnalytics] = useState<ProposalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    clientProfileId: "",
    title: "",
    summary: "",
    introduction: "",
    terms: "",
    taxRateBps: 0,
    lineItems: [] as BuilderLineItem[],
    timeline: [] as TimelineItem[],
    deliverables: [] as DeliverableItem[],
    addons: [] as BuilderLineItem[],
  });
  const [aiPrompt, setAiPrompt] = useState("");

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId]
  );

  const loadAll = useCallback(async () => {
    if (!businessProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ businessProfileId });
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (search.trim()) q.set("q", search.trim());
      const [proposalRes, templateRes, serviceRes, analyticsRes] =
        await Promise.all([
          fetch(`/api/proposals?${q}`),
          fetch(`/api/proposals/templates?businessProfileId=${businessProfileId}`),
          fetch(`/api/proposals/services?businessProfileId=${businessProfileId}`),
          fetch(`/api/proposals/analytics?businessProfileId=${businessProfileId}`),
        ]);
      const proposalBody = await proposalRes.json();
      const templateBody = await templateRes.json();
      const serviceBody = await serviceRes.json();
      const analyticsBody = await analyticsRes.json();
      if (!proposalRes.ok) throw new Error(proposalBody.error ?? "Couldn't load proposals.");
      setProposals(proposalBody.proposals ?? []);
      setTemplates(templateBody.templates ?? []);
      setServices(serviceBody.services ?? []);
      setAnalytics(analyticsBody.analytics ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load proposals.");
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, search, statusFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const resetDraft = () => {
    setDraft({
      clientProfileId: clients[0]?.id ?? "",
      title: "",
      summary: "",
      introduction: "",
      terms: "",
      taxRateBps: 0,
      lineItems: [],
      timeline: [],
      deliverables: [],
      addons: [],
    });
    setAiPrompt("");
    setPortalLink(null);
  };

  const openCreate = () => {
    resetDraft();
    setShowEditor(true);
  };

  const openEdit = (proposal: ProposalWithMeta) => {
    setDraft({
      clientProfileId: proposal.client_profile_id,
      title: proposal.title,
      summary: proposal.summary ?? "",
      introduction: proposal.introduction ?? "",
      terms: proposal.terms ?? "",
      taxRateBps: proposal.tax_rate_bps,
      lineItems: proposal.line_items,
      timeline: proposal.timeline,
      deliverables: proposal.deliverables,
      addons: proposal.addons,
    });
    setShowEditor(true);
    setPortalLink(null);
  };

  const saveProposal = async () => {
    if (!businessProfileId || !draft.clientProfileId || !draft.title.trim()) {
      setError("Choose a client and enter a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        businessProfileId,
        clientProfileId: draft.clientProfileId,
        title: draft.title,
        summary: draft.summary,
        introduction: draft.introduction,
        terms: draft.terms,
        taxRateBps: draft.taxRateBps,
        lineItems: draft.lineItems,
        timeline: draft.timeline,
        deliverables: draft.deliverables,
        addons: draft.addons,
      };
      const res = await fetch(
        selected ? `/api/proposals/${selected.id}` : "/api/proposals",
        {
          method: selected ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save proposal.");
      setShowEditor(false);
      await loadAll();
      if (body.proposal?.id) {
        window.history.replaceState(null, "", `${PROPOSALS_PATH}?id=${body.proposal.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save proposal.");
    } finally {
      setSaving(false);
    }
  };

  const generateWithAi = async () => {
    if (!businessProfileId || !aiPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const client = clients.find((c) => c.id === draft.clientProfileId);
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessProfileId,
          prompt: aiPrompt,
          clientName: client?.display_name,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't generate proposal.");
      const generated = body.draft;
      setDraft((prev) => ({
        ...prev,
        title: generated.title ?? prev.title,
        summary: generated.summary ?? prev.summary,
        introduction: generated.introduction ?? prev.introduction,
        terms: generated.terms ?? prev.terms,
        lineItems: generated.lineItems ?? prev.lineItems,
        timeline: generated.timeline ?? prev.timeline,
        deliverables: generated.deliverables ?? prev.deliverables,
        addons: generated.addons ?? prev.addons,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate proposal.");
    } finally {
      setGenerating(false);
    }
  };

  const sendProposal = async (proposalId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't send proposal.");
      if (body.portalToken) {
        setPortalLink(`${window.location.origin}/proposal/${body.portalToken}`);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send proposal.");
    } finally {
      setSaving(false);
    }
  };

  if (!isBusiness) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-bold tracking-tight">Proposals</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Switch to a business vault to create and manage client proposals.
        </p>
      </div>
    );
  }

  if (showEditor) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowEditor(false)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to proposals
        </button>
        <div className={cardClass}>
          <h2 className="text-lg font-semibold">
            {selected ? "Edit proposal" : "New proposal"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Client vault</span>
              <select
                className={inputClass}
                value={draft.clientProfileId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, clientProfileId: e.target.value }))
                }
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Title</span>
              <input
                className={inputClass}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
              <Sparkles className="h-4 w-4" />
              AI proposal draft
            </div>
            <textarea
              className={`${inputClass} mt-2 min-h-[88px]`}
              placeholder="Describe the project, scope, and pricing goals…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button
              type="button"
              disabled={generating || !aiPrompt.trim()}
              onClick={() => void generateWithAi()}
              className={`${buttonPrimary} mt-3`}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate with Gideon
            </button>
          </div>

          {[
            ["summary", "Summary"],
            ["introduction", "Introduction"],
            ["terms", "Terms"],
          ].map(([key, label]) => (
            <label key={key} className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">{label}</span>
              <textarea
                className={`${inputClass} min-h-[96px]`}
                value={draft[key as keyof typeof draft] as string}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </label>
          ))}

          <ProposalBuilderSection
            title="Services & pricing"
            items={draft.lineItems}
            onChange={(lineItems) => setDraft((d) => ({ ...d, lineItems }))}
            services={services}
          />
          <ProposalBuilderSection
            title="Optional add-ons"
            items={draft.addons}
            onChange={(addons) =>
              setDraft((d) => ({
                ...d,
                addons: addons.map((a) => ({ ...a, optional: true })),
              }))
            }
            services={services}
            optional
          />
          <TimelineSection
            items={draft.timeline}
            onChange={(timeline) => setDraft((d) => ({ ...d, timeline }))}
          />
          <DeliverablesSection
            items={draft.deliverables}
            onChange={(deliverables) => setDraft((d) => ({ ...d, deliverables }))}
          />

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveProposal()}
              className={buttonPrimary}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save proposal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proposals</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Create professional client proposals with AI, pricing, timelines, and a
            client portal. Accepted proposals create projects and contracts in the
            client vault.
          </p>
        </div>
        <button type="button" onClick={openCreate} className={buttonPrimary}>
          <Plus className="h-4 w-4" />
          New proposal
        </button>
      </div>

      {analytics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AnalyticsCard label="Total proposals" value={String(analytics.total)} />
          <AnalyticsCard
            label="Pipeline value"
            value={formatMoney(analytics.totalValueCents)}
          />
          <AnalyticsCard
            label="Accepted value"
            value={formatMoney(analytics.acceptedValueCents)}
          />
          <AnalyticsCard
            label="Accept rate"
            value={`${Math.round(analytics.acceptRate * 100)}%`}
            icon={<BarChart3 className="h-4 w-4 text-brand" />}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Dashboard", FileText],
            ["templates", "Templates", FileText],
            ["services", "Services", Wrench],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === id
                ? "bg-brand text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {portalLink ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Client portal link:{" "}
          <a href={portalLink} className="font-medium underline">
            {portalLink}
          </a>
        </p>
      ) : null}

      {tab === "dashboard" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Search proposals"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ProposalStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {PROPOSAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROPOSAL_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : proposals.length === 0 ? (
            <div className={`${cardClass} text-center`}>
              <p className="text-sm text-ink-muted">No proposals yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <div key={proposal.id} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {proposal.title}
                        </h3>
                        <ProposalStatusBadge status={proposal.status} />
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        {proposal.client_name} ·{" "}
                        {formatMoney(proposal.total_cents, proposal.currency)}
                        {proposal.view_count
                          ? ` · ${proposal.view_count} views`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`${PROPOSALS_PATH}?id=${proposal.id}`}
                        className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"
                        onClick={() => openEdit(proposal)}
                      >
                        Edit
                      </Link>
                      <a
                        href={`/api/proposals/${proposal.id}/export`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"
                      >
                        Export PDF
                      </a>
                      {proposal.status === "draft" ||
                      proposal.status === "changes_requested" ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void sendProposal(proposal.id)}
                          className={buttonPrimary}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {selectedId === proposal.id && proposal.client_feedback ? (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Client feedback: {proposal.client_feedback}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === "templates" ? (
        <TemplatesPanel
          businessProfileId={businessProfileId!}
          templates={templates}
          onChanged={() => void loadAll()}
        />
      ) : null}

      {tab === "services" ? (
        <ServicesPanel
          businessProfileId={businessProfileId!}
          services={services}
          onChanged={() => void loadAll()}
        />
      ) : null}
    </div>
  );
}

function AnalyticsCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function ProposalBuilderSection({
  title,
  items,
  onChange,
  services,
  optional = false,
}: {
  title: string;
  items: BuilderLineItem[];
  onChange: (items: BuilderLineItem[]) => void;
  services: ServiceTemplate[];
  optional?: boolean;
}) {
  const addBlank = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        title: "",
        quantity: 1,
        unitLabel: "each",
        unitPriceCents: 0,
        optional,
      },
    ]);
  };
  const addFromService = (service: ServiceTemplate) => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        title: service.name,
        description: service.description ?? undefined,
        quantity: service.default_quantity,
        unitLabel: service.unit_label,
        unitPriceCents: service.unit_price_cents,
        optional,
      },
    ]);
  };
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap gap-2">
          {services.slice(0, 4).map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => addFromService(service)}
              className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50"
            >
              + {service.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addBlank}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50"
          >
            + Line item
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-xl border border-stone-200 p-3"
          >
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-4">
              <input
                className={`${inputClass} sm:col-span-4`}
                placeholder="Title"
                value={item.title}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, title: e.target.value };
                  onChange(next);
                }}
              />
              <textarea
                className={`${inputClass} min-h-[72px] sm:col-span-4`}
                placeholder="What's included — what the client gets"
                value={item.description ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = {
                    ...item,
                    description: e.target.value || undefined,
                  };
                  onChange(next);
                }}
              />
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, quantity: Number(e.target.value) || 1 };
                  onChange(next);
                }}
              />
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                placeholder="Price ($)"
                value={(item.unitPriceCents / 100).toFixed(2)}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = {
                    ...item,
                    unitPriceCents: Math.round(Number(e.target.value) * 100) || 0,
                  };
                  onChange(next);
                }}
              />
              <input
                className={inputClass}
                placeholder="Unit"
                value={item.unitLabel}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, unitLabel: e.target.value };
                  onChange(next);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="mt-0.5 shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Remove line item"
              title="Remove line item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineSection({
  items,
  onChange,
}: {
  items: TimelineItem[];
  onChange: (items: TimelineItem[]) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Timeline</h3>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              {
                id: crypto.randomUUID(),
                title: "",
                sortOrder: items.length,
              },
            ])
          }
          className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50"
        >
          + Milestone
        </button>
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          className="mb-2 flex items-start gap-2 rounded-xl border border-stone-200 p-3"
        >
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            <input
              className={inputClass}
              placeholder="Milestone"
              value={item.title}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...item, title: e.target.value };
                onChange(next);
              }}
            />
            <input
              className={inputClass}
              type="date"
              value={item.startDate ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...item, startDate: e.target.value };
                onChange(next);
              }}
            />
            <input
              className={inputClass}
              type="date"
              value={item.endDate ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...item, endDate: e.target.value };
                onChange(next);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-0.5 shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-rose-50 hover:text-rose-700"
            aria-label="Remove milestone"
            title="Remove milestone"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function DeliverablesSection({
  items,
  onChange,
}: {
  items: DeliverableItem[];
  onChange: (items: DeliverableItem[]) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Deliverables</h3>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              { id: crypto.randomUUID(), title: "", sortOrder: items.length },
            ])
          }
          className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50"
        >
          + Deliverable
        </button>
      </div>
      {items.map((item, index) => (
        <div key={item.id} className="mb-2 flex items-start gap-2">
          <input
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="Deliverable"
            value={item.title}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...item, title: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-rose-50 hover:text-rose-700"
            aria-label="Remove deliverable"
            title="Remove deliverable"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TemplatesPanel({
  businessProfileId,
  templates,
  onChanged,
}: {
  businessProfileId: string;
  templates: ProposalTemplate[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const createTemplate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/proposals/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessProfileId, name }),
    });
    setName("");
    setBusy(false);
    onChanged();
  };
  return (
    <div className="space-y-4">
      <div className={`${cardClass} flex flex-wrap gap-2`}>
        <input
          className={`${inputClass} min-w-[220px] flex-1`}
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" disabled={busy} onClick={() => void createTemplate()} className={buttonPrimary}>
          Add template
        </button>
      </div>
      {templates.map((template) => (
        <div key={template.id} className={cardClass}>
          <h3 className="font-semibold">{template.name}</h3>
          {template.description ? (
            <p className="mt-1 text-sm text-ink-muted">{template.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ServicesPanel({
  businessProfileId,
  services,
  onChanged,
}: {
  businessProfileId: string;
  services: ServiceTemplate[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const createService = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/proposals/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessProfileId,
        name,
        unitPriceCents: Math.round(Number(price) * 100) || 0,
      }),
    });
    setName("");
    setPrice("");
    setBusy(false);
    onChanged();
  };
  return (
    <div className="space-y-4">
      <div className={`${cardClass} grid gap-2 sm:grid-cols-3`}>
        <input
          className={inputClass}
          placeholder="Service name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Unit price ($)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="button" disabled={busy} onClick={() => void createService()} className={buttonPrimary}>
          Add service
        </button>
      </div>
      {services.map((service) => (
        <div key={service.id} className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{service.name}</h3>
              <p className="text-sm text-ink-muted">
                {formatMoney(service.unit_price_cents)} / {service.unit_label}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
