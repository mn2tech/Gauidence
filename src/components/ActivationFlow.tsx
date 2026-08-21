"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  FileUp,
  GraduationCap,
  Home,
  IdCard,
  Loader2,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  Users,
} from "lucide-react";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { useActiveProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVATION_PROGRESS,
  activationProgressIndex,
  categorizeFirstValueFacts,
  DEFAULT_SPACE_NAMES,
  firstValueCategoryLine,
  GUIDED_GIDEON_QUESTIONS,
  type ActivationStep,
  type FirstValueCategory,
} from "@/lib/onboarding/activation";
import {
  INTENT_OPTIONS,
  SCHOOL_INTENT_OPTIONS,
  type OnboardingIntent,
  type SchoolIntent,
} from "@/lib/onboarding/intent";
import { trackFunnelEvent } from "@/lib/onboarding/events";
import { timeOfDayGreeting } from "@/lib/simple-home/helpers";
import {
  buildPastedTextFile,
  uploadAndAnalyzeToVault,
  VAULT_FILE_ACCEPT,
} from "@/lib/vault/clientUpload";
import { kickDocumentProcessingJobs } from "@/lib/documents/clientProcessing";
import type { Fact } from "@/lib/analysis/types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

type Props = {
  onComplete: (result: {
    activeProfileId: string | null;
    skipped: boolean;
  }) => void | Promise<void>;
};

type KnowledgeMode = "choose" | "note" | "tell" | "card";

const CATEGORY_ICONS: Record<string, typeof Building2> = {
  business: Building2,
  personal: Home,
  family: Users,
  school: GraduationCap,
  organization: Building2,
};

function ProgressBar({ step }: { step: ActivationStep }) {
  const idx = activationProgressIndex(step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-muted sm:gap-3">
      {ACTIVATION_PROGRESS.map((item, i) => {
        const done = i < idx || step === "completed";
        const current = i === idx && step !== "completed";
        return (
          <li key={item.id} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="hidden text-stone-300 sm:inline" aria-hidden>
                →
              </span>
            ) : null}
            <span
              className={
                done || current
                  ? "text-brand-dark"
                  : "text-ink-muted"
              }
            >
              <span
                className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-brand text-white"
                    : current
                      ? "bg-brand-light text-brand-dark ring-1 ring-brand/40"
                      : "bg-stone-100 text-ink-muted"
                }`}
              >
                {i + 1}
              </span>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ActivationFlow({ onComplete }: Props) {
  const { refresh, switchProfile, active } = useActiveProfile();
  const [step, setStep] = useState<ActivationStep>("welcome");
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const [schoolIntent, setSchoolIntent] = useState<SchoolIntent | null>(null);
  const [schoolStep, setSchoolStep] = useState(false);
  const [greetName, setGreetName] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [description, setDescription] = useState("");
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>("choose");
  const [noteText, setNoteText] = useState("");
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [categories, setCategories] = useState<FirstValueCategory[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);

  const greeting = timeOfDayGreeting();

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/account/onboarding");
        const body = (await res.json().catch(() => ({}))) as {
          step?: ActivationStep;
          intent?: OnboardingIntent | null;
          greetName?: string | null;
        };
        if (body.greetName) setGreetName(body.greetName);
        if (body.intent) {
          setIntent(body.intent);
          setSpaceName(DEFAULT_SPACE_NAMES[body.intent] ?? "My Space");
        }
        if (
          body.step &&
          body.step !== "welcome" &&
          body.step !== "completed"
        ) {
          setStep(body.step);
        }
        trackFunnelEvent("onboarding_started");
      } catch {
        /* start fresh */
      }
    })();
  }, []);

  useEffect(() => {
    if (active?.id && !activeProfileId) {
      setActiveProfileId(active.id);
    }
  }, [active?.id, activeProfileId]);

  const patch = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/account/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        step?: ActivationStep;
        activeProfileId?: string | null;
        createdProfileId?: string | null;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Something went wrong. Try again.");
      }
      return body;
    },
    []
  );

  async function selectCategory(id: OnboardingIntent) {
    if (saving) return;
    if (id === "school") {
      setIntent(id);
      setSchoolStep(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patch({ action: "select_category", intent: id });
      setIntent(id);
      setSpaceName(DEFAULT_SPACE_NAMES[id] ?? "My Space");
      setStep("create_space");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your choice.");
    } finally {
      setSaving(false);
    }
  }

  async function selectSchool(id: SchoolIntent) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await patch({
        action: "select_category",
        intent: "school",
        schoolIntent: id,
      });
      setIntent("school");
      setSchoolIntent(id);
      setSpaceName(
        id === "teacher"
          ? "Teaching"
          : id === "parent"
            ? "My child"
            : "My studies"
      );
      setSchoolStep(false);
      setStep("create_space");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your choice.");
    } finally {
      setSaving(false);
    }
  }

  async function createSpace() {
    if (saving || !intent) return;
    setSaving(true);
    setError(null);
    try {
      const body = await patch({
        action: "create_space",
        intent,
        schoolIntent: schoolIntent ?? undefined,
        workspaceName: spaceName.trim() || undefined,
        description: description.trim() || undefined,
      });
      const profileId = body.activeProfileId ?? body.createdProfileId ?? null;
      if (profileId) {
        setActiveProfileId(profileId);
        await refresh();
        await switchProfile(profileId);
      }
      setStep("add_knowledge");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create your Space.");
    } finally {
      setSaving(false);
    }
  }

  async function waitForAnalysis(documentId: string): Promise<{
    facts: Fact[];
    summary: string | null;
  }> {
    const maxAttempts = 45;
    for (let i = 0; i < maxAttempts; i++) {
      if (i === 0 || i % 3 === 0) {
        void kickDocumentProcessingJobs(3);
      }
      const res = await fetch(`/api/documents/${documentId}/status`);
      if (res.ok) {
        const body = (await res.json()) as {
          active?: boolean;
          analysisStatus?: string;
          facts?: Fact[] | null;
          summary?: string | null;
          processingLabel?: string;
        };
        if (body.processingLabel) setStatusLabel(body.processingLabel);
        const done =
          !body.active &&
          (body.analysisStatus === "completed" ||
            body.analysisStatus === "needs_verification" ||
            Boolean(body.facts?.length) ||
            Boolean(body.summary));
        if (done) {
          return {
            facts: Array.isArray(body.facts) ? body.facts : [],
            summary: body.summary ?? null,
          };
        }
        if (body.analysisStatus === "failed") {
          return { facts: [], summary: body.summary ?? null };
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { facts: [], summary: null };
  }

  async function processUploadedDocument(
    documentId: string,
    source: string
  ) {
    await patch({ action: "first_item_added", source });
    setStep("first_value");
    setStatusLabel("Guardian is reading…");
    const { facts, summary: docSummary } = await waitForAnalysis(documentId);
    const cats = categorizeFirstValueFacts(facts);
    setCategories(cats);
    setSummary(docSummary);
    await patch({ action: "first_value" });
    trackFunnelEvent("first_value_reached", { source });
    setStatusLabel(null);
  }

  async function handleFile(file: File | null) {
    if (!file || saving) return;
    const profileId = activeProfileId ?? active?.id;
    if (!profileId) {
      setError("Create your Space first, then add knowledge.");
      return;
    }
    setSaving(true);
    setError(null);
    setStatusLabel("Uploading…");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      if (!user) throw new Error("Please sign in again.");

      const result = await uploadAndAnalyzeToVault({
        userId: user.id,
        profileId,
        file,
        onStatus: setStatusLabel,
      });
      trackFunnelEvent("first_item_added", { source: "upload" });
      await processUploadedDocument(result.documentId, "upload");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStep("add_knowledge");
    } finally {
      setSaving(false);
      setStatusLabel(null);
    }
  }

  async function submitTextItem(args: {
    title: string;
    content: string;
    source: string;
  }) {
    if (saving || !args.content.trim()) return;
    const profileId = activeProfileId ?? active?.id;
    if (!profileId) {
      setError("Create your Space first, then add knowledge.");
      return;
    }
    setSaving(true);
    setError(null);
    setStatusLabel("Saving…");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      if (!user) throw new Error("Please sign in again.");

      const file = buildPastedTextFile({
        title: args.title,
        content: args.content.trim(),
      });
      const result = await uploadAndAnalyzeToVault({
        userId: user.id,
        profileId,
        file,
        onStatus: setStatusLabel,
      });
      trackFunnelEvent("first_item_added", { source: args.source });
      await processUploadedDocument(result.documentId, args.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      setStep("add_knowledge");
    } finally {
      setSaving(false);
      setStatusLabel(null);
    }
  }

  async function finishAndAsk(question?: string) {
    setSaving(true);
    setError(null);
    try {
      await patch({ action: "complete" });
      if (question) {
        trackFunnelEvent("first_gideon_question", { source: "suggested" });
      }
      await onComplete({
        activeProfileId: activeProfileId,
        skipped: false,
      });
      if (question) {
        const params = new URLSearchParams({
          draft: question,
        });
        if (activeProfileId) params.set("profileId", activeProfileId);
        window.location.assign(`${ASK_GIDEON_PATH}?${params.toString()}`);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finish setup.");
    } finally {
      setSaving(false);
    }
  }

  async function skipAll() {
    if (saving) return;
    setSaving(true);
    try {
      await patch({ skip: true });
      trackFunnelEvent("intent_skipped");
      await onComplete({ activeProfileId: null, skipped: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't skip.");
    } finally {
      setSaving(false);
    }
  }

  const categoryLabel =
    INTENT_OPTIONS.find((o) => o.id === intent)?.label ?? "Space";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-light/50 via-background to-background">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        <GuardianLogo variant="horizontal" size="sm" />
        {step !== "welcome" ? (
          <div className="mt-4">
            <ProgressBar step={step} />
          </div>
        ) : null}

        <div className="mt-6 flex-1">
          {/* ── Welcome ───────────────────────────────────────────── */}
          {step === "welcome" && !schoolStep ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {greeting}
                  {greetName ? `, ${greetName}` : ""}.
                </h1>
                <p className="mt-1 text-lg font-semibold text-brand-dark">
                  Welcome to Guardian.
                </p>
                <p className="mt-4 text-base font-semibold text-foreground">
                  Let&apos;s give Guardian something useful to remember.
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  What would you like Guardian to help you manage?
                </p>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {INTENT_OPTIONS.map((opt) => {
                  const Icon = CATEGORY_ICONS[opt.id] ?? Sparkles;
                  return (
                    <li key={opt.id} className="sm:col-span-1">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void selectCategory(opt.id)}
                        className="flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-brand hover:bg-brand-light/30 disabled:opacity-60"
                      >
                        <Icon className="h-5 w-5 text-brand" aria-hidden />
                        <span className="text-sm font-semibold text-foreground">
                          {opt.label}
                        </span>
                        <span className="text-xs leading-relaxed text-ink-muted">
                          {opt.description}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {schoolStep ? (
            <div className="space-y-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSchoolStep(false)}
                className="text-sm font-medium text-brand hover:text-brand-dark"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold tracking-tight">
                School — which fits best?
              </h1>
              <ul className="grid gap-2.5">
                {SCHOOL_INTENT_OPTIONS.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void selectSchool(opt.id)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                    >
                      <span className="text-xl" aria-hidden>
                        {opt.emoji}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── Create Space ──────────────────────────────────────── */}
          {step === "create_space" ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Let&apos;s create your {categoryLabel} Space.
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  A Space gives Guardian a place to understand one part of your
                  life or work.
                </p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Space name
                </span>
                <input
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none ring-brand focus:ring-2"
                  placeholder={DEFAULT_SPACE_NAMES[intent ?? "other"]}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Short description{" "}
                  <span className="font-normal normal-case">(optional)</span>
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={280}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none ring-brand focus:ring-2"
                  placeholder="What should Guardian remember here?"
                />
              </label>
              <button
                type="button"
                disabled={saving || !spaceName.trim()}
                onClick={() => void createSpace()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Create Space
              </button>
            </div>
          ) : null}

          {/* ── Add Knowledge ─────────────────────────────────────── */}
          {step === "add_knowledge" ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Give Guardian something to work with.
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  Upload a contract, meeting notes, receipt, school document,
                  business card, policy, proposal, or anything you may want
                  Guardian to remember later.
                </p>
              </div>

              {knowledgeMode === "choose" ? (
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  <li>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => fileRef.current?.click()}
                      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-light/30 disabled:opacity-60"
                    >
                      <FileUp className="h-5 w-5 text-brand" />
                      <span className="text-sm font-semibold">
                        Upload a document
                      </span>
                      <span className="text-xs text-ink-muted">
                        PDF, photo, or file
                      </span>
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={VAULT_FILE_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void handleFile(f);
                      }}
                    />
                  </li>
                  <li>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setKnowledgeMode("note")}
                      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-light/30 disabled:opacity-60"
                    >
                      <NotebookPen className="h-5 w-5 text-brand" />
                      <span className="text-sm font-semibold">Add a note</span>
                      <span className="text-xs text-ink-muted">
                        Quick text Guardian can remember
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setKnowledgeMode("card");
                        fileRef.current?.click();
                      }}
                      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-light/30 disabled:opacity-60"
                    >
                      <IdCard className="h-5 w-5 text-brand" />
                      <span className="text-sm font-semibold">
                        Scan a business card
                      </span>
                      <span className="text-xs text-ink-muted">
                        Photo of a card or contact
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setKnowledgeMode("tell")}
                      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-light/30 disabled:opacity-60"
                    >
                      <MessageSquareText className="h-5 w-5 text-brand" />
                      <span className="text-sm font-semibold">
                        Tell Gideon something
                      </span>
                      <span className="text-xs text-ink-muted">
                        A fact, commitment, or reminder
                      </span>
                    </button>
                  </li>
                </ul>
              ) : null}

              {(knowledgeMode === "note" || knowledgeMode === "tell") && (
                <div className="space-y-3">
                  <button
                    type="button"
                    className="text-sm font-medium text-brand"
                    onClick={() => {
                      setKnowledgeMode("choose");
                      setNoteText("");
                    }}
                  >
                    ← Back
                  </button>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none ring-brand focus:ring-2"
                    placeholder={
                      knowledgeMode === "tell"
                        ? "e.g. Follow up with Maya about the proposal by Friday."
                        : "Type a note Guardian should remember…"
                    }
                  />
                  <button
                    type="button"
                    disabled={saving || !noteText.trim()}
                    onClick={() =>
                      void submitTextItem({
                        title:
                          knowledgeMode === "tell"
                            ? "Told Gideon"
                            : "First note",
                        content: noteText,
                        source: knowledgeMode,
                      })
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    Save for Guardian
                  </button>
                </div>
              )}

              {statusLabel ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {statusLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── First value ───────────────────────────────────────── */}
          {step === "first_value" ? (
            <div className="space-y-5">
              {statusLabel || saving ? (
                <div className="rounded-2xl border border-brand/20 bg-white p-6 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {statusLabel ?? "Guardian is finding what matters…"}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      Guardian found useful information.
                    </h1>
                    <p className="mt-2 text-sm text-ink-muted">
                      Guardian now knows more about this Space.
                    </p>
                  </div>
                  {categories.length > 0 ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {categories.map((cat) => (
                        <li
                          key={cat.id}
                          className="rounded-xl border border-stone-200 bg-white px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {firstValueCategoryLine(cat)}
                          </p>
                          {cat.samples[0] ? (
                            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                              {cat.samples[0]}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : summary ? (
                    <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm leading-relaxed text-ink-muted">
                      {summary}
                    </p>
                  ) : (
                    <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-ink-muted">
                      Your item is saved. Ask Gideon to explore what Guardian
                      remembers.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setStep("ask_gideon")}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      Ask Gideon about this
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setKnowledgeMode("choose");
                        setStep("add_knowledge");
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                    >
                      Add another item
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* ── Ask Gideon ────────────────────────────────────────── */}
          {step === "ask_gideon" ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Ask Gideon about this Space.
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  Pick a question — you don&apos;t have to invent the first
                  prompt.
                </p>
              </div>
              <ul className="grid gap-2">
                {GUIDED_GIDEON_QUESTIONS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void finishAndAsk(q)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={saving}
                onClick={() => void finishAndAsk()}
                className="w-full text-center text-sm font-medium text-ink-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Go to Guardian home
              </button>
              <p className="text-center text-xs text-ink-muted">
                Gideon answers using knowledge from your Space.
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {step === "welcome" || step === "create_space" ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void skipAll()}
            className="mt-6 text-center text-sm font-medium text-ink-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Just explore
          </button>
        ) : null}
      </div>
    </div>
  );
}
