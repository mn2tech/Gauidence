"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Globe,
  Loader2,
  Plus,
  Shield,
  Sparkles,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { activeClientsOf, isOrgStyleProfile } from "@/lib/profiles/types";
import { formatMoney } from "@/lib/proposals/pricing";
import { PROPOSALS_PATH } from "@/lib/routes";
import type { BusinessAssessment, BusinessAssessmentDetail } from "@/lib/business-advisor/types";

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";
const cardClass = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-rose-100 text-rose-900",
  high: "bg-orange-100 text-orange-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-stone-100 text-stone-700",
};

export default function BusinessAdvisorScreen() {
  const router = useRouter();
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

  const [assessments, setAssessments] = useState<BusinessAssessment[]>([]);
  const [detail, setDetail] = useState<BusinessAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [clientProfileId, setClientProfileId] = useState("");

  const loadList = useCallback(async () => {
    if (!businessProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business-advisor/assessments?businessProfileId=${businessProfileId}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load assessments.");
      setAssessments(body.assessments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load assessments.");
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  const loadDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/business-advisor/assessments/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load assessment.");
      setDetail(body.assessment ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load assessment.");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const createAssessment = async () => {
    if (!businessProfileId || !companyName.trim() || !websiteUrl.trim()) {
      setError("Enter company name and website URL.");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/business-advisor/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessProfileId,
          companyName: companyName.trim(),
          websiteUrl: websiteUrl.trim(),
          clientProfileId: clientProfileId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't create assessment.");
      setShowNew(false);
      await loadList();
      router.push(`/business-advisor?id=${body.assessment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create assessment.");
    }
  };

  const runAnalysis = async (id: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business-advisor/assessments/${id}/analyze`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Analysis failed.");
      setDetail(body.assessment);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const createProposal = async (id: string) => {
    const clientId = clientProfileId || detail?.client_profile_id;
    if (!clientId) {
      setError("Select a client vault before creating a proposal.");
      return;
    }
    setCreatingProposal(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business-advisor/assessments/${id}/proposal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientProfileId: clientId }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't create proposal.");
      router.push(`${PROPOSALS_PATH}?id=${body.proposalId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create proposal.");
    } finally {
      setCreatingProposal(false);
    }
  };

  if (!isBusiness) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-bold">Business Advisor</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Switch to a business vault to run website and security assessments.
        </p>
      </div>
    );
  }

  if (showNew) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowNew(false)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className={cardClass}>
          <h2 className="text-lg font-semibold">New assessment</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Guardian will scan the website and security surface, then recommend
            solutions with pricing.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Company name</span>
              <input
                className={inputClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Proxdose"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Website URL</span>
              <input
                className={inputClass}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Client vault (optional)</span>
              <select
                className={inputClass}
                value={clientProfileId}
                onChange={(e) => setClientProfileId(e.target.value)}
              >
                <option value="">Select later</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className={`${buttonPrimary} mt-4`}
            onClick={() => void createAssessment()}
          >
            <Plus className="h-4 w-4" />
            Create assessment
          </button>
        </div>
      </div>
    );
  }

  if (detail && selectedId) {
    return (
      <div className="space-y-4">
        <Link
          href="/business-advisor"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          All assessments
        </Link>

        <div className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                Business Opportunity Report
              </p>
              <h1 className="text-2xl font-bold">{detail.company_name}</h1>
              <a
                href={detail.website_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand"
              >
                <Globe className="h-3.5 w-3.5" />
                {detail.website_url}
              </a>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                detail.status === "complete"
                  ? "bg-emerald-100 text-emerald-800"
                  : detail.status === "failed"
                    ? "bg-rose-100 text-rose-800"
                    : detail.status === "analyzing"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-stone-100 text-stone-700"
              }`}
            >
              {detail.status}
            </span>
          </div>

          {detail.status !== "complete" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={analyzing || detail.status === "analyzing"}
                onClick={() => void runAnalysis(detail.id)}
                className={buttonPrimary}
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Run website & security scan
              </button>
            </div>
          ) : (
            <>
              {detail.executive_summary ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {detail.executive_summary}
                </p>
              ) : null}

              {detail.findings.length > 0 ? (
                <section className="mt-6">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="h-4 w-4 text-brand" />
                    Findings ({detail.findings.length})
                  </h2>
                  <div className="mt-2 space-y-2">
                    {detail.findings.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-xl border border-stone-200 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_COLORS[f.severity] ?? ""}`}
                          >
                            {f.severity}
                          </span>
                          <span className="text-[10px] uppercase text-ink-muted">
                            {f.analyzer}
                          </span>
                          <span className="font-medium">{f.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.outcomes.length > 0 ? (
                <section className="mt-6">
                  <h2 className="text-sm font-semibold">Business outcomes</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                    {detail.outcomes.map((o) => (
                      <li key={o.id}>{o.outcome_text}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.solutions.length > 0 ? (
                <section className="mt-6">
                  <h2 className="text-sm font-semibold">Recommended solutions & pricing</h2>
                  <div className="mt-2 space-y-2">
                    {detail.solutions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium">{s.title}</p>
                          {s.description ? (
                            <p className="text-xs text-ink-muted">{s.description}</p>
                          ) : null}
                          {s.implementation_time ? (
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {s.implementation_time}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-sm font-bold text-brand">
                          {formatMoney(s.price_cents)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    Total:{" "}
                    {formatMoney(
                      detail.solutions.reduce((sum, s) => sum + s.price_cents, 0)
                    )}
                  </p>
                </section>
              ) : null}

              <div className="mt-6 flex flex-wrap items-end gap-3">
                {!detail.client_profile_id && clients.length > 0 ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Client vault</span>
                    <select
                      className={inputClass}
                      value={clientProfileId}
                      onChange={(e) => setClientProfileId(e.target.value)}
                    >
                      <option value="">Select client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {detail.proposal_id ? (
                  <Link
                    href={`${PROPOSALS_PATH}?id=${detail.proposal_id}`}
                    className={buttonPrimary}
                  >
                    <FileText className="h-4 w-4" />
                    Open proposal
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={creatingProposal}
                    onClick={() => void createProposal(detail.id)}
                    className={buttonPrimary}
                  >
                    {creatingProposal ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Create priced proposal
                  </button>
                )}
              </div>
            </>
          )}

          {detail.error_message ? (
            <p className="mt-4 text-sm text-rose-700">{detail.error_message}</p>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Advisor</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Scan a company website and security surface, identify growth
            opportunities, and generate a priced Guardian proposal.
          </p>
        </div>
        <button type="button" onClick={() => setShowNew(true)} className={buttonPrimary}>
          <Plus className="h-4 w-4" />
          New assessment
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : assessments.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-sm text-ink-muted">No assessments yet.</p>
          <button
            type="button"
            className={`${buttonPrimary} mt-4`}
            onClick={() => setShowNew(true)}
          >
            Start with Proxdose or any client website
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Link
              key={a.id}
              href={`/business-advisor?id=${a.id}`}
              className={`${cardClass} block transition hover:border-brand/40`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.company_name}</h3>
                  <p className="text-sm text-ink-muted">{a.website_url}</p>
                </div>
                <span className="text-xs font-semibold capitalize text-ink-muted">
                  {a.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
