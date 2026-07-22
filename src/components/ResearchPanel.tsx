"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Building2,
  ExternalLink,
  Loader2,
  Save,
  Search,
  UserRound,
  Globe2,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import PlanLimitAlert from "@/components/PlanLimitAlert";
import {
  parseResearchBrief,
  type ResearchSectionKind,
  type ResearchSubjectKind,
} from "@/lib/research/prompt";
import { dispatchAwardsFromResponse } from "@/lib/awards/client";
type WebSource = {
  title: string;
  url: string;
  snippet: string;
};

type ResearchResult = {
  query: string;
  subjectKind: ResearchSubjectKind;
  brief: string;
  sources: WebSource[];
  vaultContextUsed: boolean;
  profileId: string;
  profileName: string;
};

const SECTION_STYLES: Record<ResearchSectionKind, string> = {
  overview: "border-stone-200 bg-white",
  from_the_web: "border-sky-200 bg-sky-50/70",
  guardian_context: "border-brand/30 bg-brand-light/40",
  possible_concerns: "border-amber-200 bg-amber-50/70",
  needs_verification: "border-orange-200 bg-orange-50/70",
  suggestion: "border-emerald-200 bg-emerald-50/70",
  body: "border-stone-200 bg-white",
};

export default function ResearchPanel() {
  const { active, profiles, loading } = useActiveProfile();
  const [query, setQuery] = useState("");
  const [subjectKind, setSubjectKind] =
    useState<ResearchSubjectKind>("company");
  const [includeVault, setIncludeVault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setErrorState] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const setError = (message: string | null, code?: string) => {
    if (message === null) setErrorState(null);
    else setErrorState(code ? { message, code } : { message });
  };
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);

  useEffect(() => {
    const onProfile = () => {
      setResult(null);
      setError(null);
      setNotice(null);
    };
    window.addEventListener("guardian:profile-changed", onProfile);
    return () =>
      window.removeEventListener("guardian:profile-changed", onProfile);
  }, []);

  if (loading && !active && profiles.length === 0) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (!loading && profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Research</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Create a person or space first, then research companies and people
          with live web sources tied to your vault.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Go to dashboard
        </Link>
      </div>
    );
  }

  const runResearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          subjectKind,
          includeVault,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        query?: string;
        subjectKind?: ResearchSubjectKind;
        brief?: string;
        sources?: WebSource[];
        vaultContextUsed?: boolean;
        profileId?: string;
        profileName?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Research failed. Please try again.", body.code);
        return;
      }
      dispatchAwardsFromResponse(body);
      setResult({
        query: body.query ?? query.trim(),
        subjectKind: body.subjectKind ?? subjectKind,
        brief: body.brief ?? "",
        sources: body.sources ?? [],
        vaultContextUsed: Boolean(body.vaultContextUsed),
        profileId: body.profileId ?? active?.id ?? "",
        profileName: body.profileName ?? active?.display_name ?? "Vault",
      });
    } catch {
      setError("Research failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveToVault = async () => {
    if (!result || saving) return;
    const profileId = result.profileId || active?.id;
    if (!profileId) {
      setError("Create or select a vault before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/research/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: result.query,
          brief: result.brief,
          sources: result.sources,
          profileId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        profileName?: string;
        analyzed?: boolean;
        analysisError?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save this brief to your vault.");
        return;
      }
      const vaultName = body.profileName ?? result.profileName;
      setNotice(
        body.analyzed
          ? `Saved to ${vaultName}'s vault and analyzed.`
          : `Saved to ${vaultName}'s vault.${
              body.analysisError ? ` Analysis: ${body.analysisError}` : ""
            }`
      );
    } catch {
      setError("Couldn't save this brief to your vault. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const sections = result ? parseResearchBrief(result.brief) : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Research
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Look up a company or person
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Gideon searches the live web and, when it helps, connects results to
          your active vault
          {active ? (
            <>
              {" "}
              (
              <span className="font-medium text-foreground">
                {active.display_name}
              </span>
              )
            </>
          ) : null}
          . Public sources are labeled clearly — never mixed with your private
          documents.
        </p>
      </div>

      <form
        onSubmit={(e) => void runResearch(e)}
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <label className="block text-xs font-medium text-ink-muted">
          Who or what are you researching?
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. crossroadconnect, DH Technologies, United Gun Shop"
            maxLength={300}
            className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
            disabled={busy}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { id: "company", label: "Company / team", icon: Building2 },
              { id: "person", label: "Person", icon: UserRound },
              { id: "other", label: "Other", icon: Globe2 },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const selected = subjectKind === id;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => setSubjectKind(id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "border-brand bg-brand-light text-brand-dark"
                    : "border-stone-300 bg-white text-foreground hover:bg-stone-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={includeVault}
            onChange={(e) => setIncludeVault(e.target.checked)}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            Include matching items from my active vault (documents, logs,
            profiles)
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {busy ? "Researching…" : "Research"}
        </button>
      </form>

      {error ? (
        <PlanLimitAlert
          message={error.message}
          code={error.code}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        />
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark" role="status">
          {notice}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Research: {result.query}
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {result.subjectKind === "company"
                  ? "Company / team"
                  : result.subjectKind === "person"
                    ? "Person"
                    : "Topic"}{" "}
                · Active vault: {result.profileName}
                {result.vaultContextUsed ? " · Vault matches included" : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveToVault()}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-stone-50 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save to vault
            </button>
          </div>

          <div className="space-y-3">
            {sections.map((section, i) => (
              <section
                key={`${section.kind}-${i}`}
                className={`rounded-xl border px-4 py-3 ${SECTION_STYLES[section.kind]}`}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {section.title}
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          {result.sources.length > 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Sources
              </h3>
              <ul className="mt-2 space-y-2">
                {result.sources.map((s, i) => (
                  <li key={s.url} className="text-sm">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1.5 font-medium text-brand hover:text-brand-dark"
                    >
                      <span className="text-ink-muted">[{i + 1}]</span>
                      <span className="min-w-0">
                        {s.title}
                        <ExternalLink className="ml-1 inline h-3 w-3 align-text-top opacity-70" />
                      </span>
                    </a>
                    {s.snippet ? (
                      <p className="mt-0.5 pl-6 text-xs text-ink-muted line-clamp-2">
                        {s.snippet}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
