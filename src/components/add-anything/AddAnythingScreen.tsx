"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  FileText,
  Globe,
  Mail,
  Mic,
  Plus,
  ScanLine,
  Sparkles,
} from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import ProcessingTracePanel from "@/components/add-anything/ProcessingTracePanel";
import SmartUploadSuggestionCard from "@/components/SmartUploadSuggestionCard";
import { useActiveProfile } from "@/components/ProfileProvider";
import { buildSmartUploadPresentation, shouldPromptSmartUpload } from "@/lib/actions/smartUpload";
import { createClient } from "@/lib/supabase/client";
import {
  profileContainerName,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";
import {
  buildPastedTextFile,
  uploadAndAnalyzeToVault,
  VAULT_FILE_ACCEPT,
  VAULT_MAX_SIZE_BYTES,
  VAULT_PASTE_MAX_CHARS,
} from "@/lib/vault/clientUpload";
import type { VaultUploadResult } from "@/lib/documents/clientProcessing";
import { kickDocumentProcessingJobs } from "@/lib/documents/clientProcessing";
import { isAnalysisReadyForFiling } from "@/lib/documents/processingStatus";
import { useDocumentProcessingPoll, type DocumentStatusSnapshot } from "@/hooks/useDocumentProcessingPoll";
import { documentsHref } from "@/lib/routes";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

type Stage = "input" | "processing" | "recommend" | "done";

/** Space Add Anything saves into — the user's active Space (Ask searches this by default). */
function destinationProfile(
  profiles: GuardianProfile[],
  active: GuardianProfile | null
): GuardianProfile | null {
  if (active) return active;
  return topLevelProfiles(profiles)[0] ?? null;
}

function uploadResultFromSnapshot(
  snapshot: DocumentStatusSnapshot,
  fileName: string
): VaultUploadResult {
  const analyzed =
    snapshot.analysisStatus === "completed" ||
    Boolean(snapshot.title || snapshot.summary || snapshot.organizationSuggestion);
  return {
    documentId: snapshot.documentId,
    fileName,
    analyzed,
    title: snapshot.title,
    documentType: snapshot.documentType,
    summary: snapshot.summary,
    organizationSuggestion: snapshot.organizationSuggestion ?? null,
  };
}

export default function AddAnythingScreen() {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{ documentId: string; fileName: string } | null>(
    null
  );
  const stagingProfileIdRef = useRef<string | null>(null);
  const pastePanelRef = useRef<HTMLFormElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const websitePanelRef = useRef<HTMLFormElement>(null);
  const websiteInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("input");
  const [status, setStatus] = useState("");
  const [processingSlow, setProcessingSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [showWebsite, setShowWebsite] = useState(false);
  const [websiteImportCount, setWebsiteImportCount] = useState<number | null>(
    null
  );
  const [presentation, setPresentation] = useState<
    ReturnType<typeof buildSmartUploadPresentation>
  >(null);
  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);

  const profile = destinationProfile(profiles, active);

  const { statuses } = useDocumentProcessingPoll(
    processingDocId ? [processingDocId] : [],
    {
      enabled: Boolean(processingDocId) && stage === "processing",
      kickProcessing: true,
    }
  );

  const snapshot = processingDocId ? statuses[processingDocId] : undefined;

  const finishWithResult = useCallback(
    (result: VaultUploadResult, options?: { continueBackgroundJobs?: boolean }) => {
      if (!profile) return;
      if (options?.continueBackgroundJobs) {
        void kickDocumentProcessingJobs(3);
      }
      pendingUploadRef.current = null;
      setProcessingSlow(false);
      const stagingProfileId = stagingProfileIdRef.current ?? profile.id;
      const shouldRecommend = shouldPromptSmartUpload(result, stagingProfileId);
      const card = shouldRecommend
        ? buildSmartUploadPresentation(result, profile.display_name)
        : null;
      if (card) {
        setPresentation(card);
        setStage("recommend");
        return;
      }
      setSavedProfileId(
        result.organizationAutoApplied
          ? (result.organizationSuggestion?.suggestedVaultId ??
              result.organizationSuggestion?.suggestedProfileId ??
              stagingProfileId)
          : stagingProfileId
      );
      stagingProfileIdRef.current = null;
      setStage("done");
    },
    [profile]
  );

  const finishProcessingEarly = useCallback(() => {
    if (!snapshot || !pendingUploadRef.current) return;
    finishWithResult(
      uploadResultFromSnapshot(snapshot, pendingUploadRef.current.fileName),
      { continueBackgroundJobs: true }
    );
    setProcessingDocId(null);
  }, [snapshot, finishWithResult]);

  useEffect(() => {
    if (stage !== "processing" || !processingDocId) {
      setProcessingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setProcessingSlow(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [stage, processingDocId]);

  useEffect(() => {
    if (!showPaste) return;
    const frame = window.requestAnimationFrame(() => {
      pastePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      pasteTextareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showPaste]);

  useEffect(() => {
    if (!showWebsite) return;
    const frame = window.requestAnimationFrame(() => {
      websitePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      websiteInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showWebsite]);

  useEffect(() => {
    if (!snapshot || stage !== "processing") return;

    const pendingResult = uploadResultFromSnapshot(
      snapshot,
      pendingUploadRef.current?.fileName ?? "Document"
    );
    const stagingProfileId = stagingProfileIdRef.current;
    const analysisReady = isAnalysisReadyForFiling(
      String(snapshot.analysisStatus)
    );

    if (
      stagingProfileId &&
      pendingResult.organizationSuggestion &&
      shouldPromptSmartUpload(pendingResult, stagingProfileId)
    ) {
      finishWithResult(pendingResult, { continueBackgroundJobs: true });
      setProcessingDocId(null);
      return;
    }

    if (analysisReady) {
      finishWithResult(pendingResult, { continueBackgroundJobs: true });
      setProcessingDocId(null);
      return;
    }

    if (snapshot.active) {
      setStatus(snapshot.processingLabel || "Analyzing content…");
      return;
    }
    if (snapshot.lastError) {
      setError(snapshot.lastError);
      setStage("input");
      setProcessingDocId(null);
      return;
    }
    finishWithResult(pendingResult, { continueBackgroundJobs: true });
    setProcessingDocId(null);
  }, [snapshot, stage, finishWithResult]);

  async function processFile(file: File) {
    if (profiles.length === 0) return;
    setError(null);
    setStage("processing");
    setStatus("Uploading…");

    const supabase = createClient();
    if (!supabase) {
      setError("Sign-in isn't available. Refresh and try again.");
      setStage("input");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in.");
      setStage("input");
      return;
    }

    try {
      if (!profile) {
        setError("Set up a space before uploading.");
        setStage("input");
        return;
      }
      // Save into the active Space so Ask Gideon (this-space search) can find it.
      const destinationProfileId = profile.id;
      stagingProfileIdRef.current = destinationProfileId;
      const ownerUserId = profile.owner_user_id ?? user.id;

      const result = await uploadAndAnalyzeToVault({
        userId: user.id,
        profileId: destinationProfileId,
        ownerUserId,
        file,
        onStatus: setStatus,
      });
      if (result.organizationSuggestion) {
        finishWithResult(result);
        return;
      }
      if (result.queued && result.documentId) {
        pendingUploadRef.current = {
          documentId: result.documentId,
          fileName: result.fileName,
        };
        setProcessingDocId(result.documentId);
        setStatus("Analyzing content…");
        return;
      }
      finishWithResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStage("input");
    }
  }

  async function handlePasteSubmit() {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    if (profiles.length === 0) {
      setError("Set up a space before pasting text.");
      return;
    }
    if (trimmed.length > VAULT_PASTE_MAX_CHARS) {
      setError(
        `Text is too long (max ${VAULT_PASTE_MAX_CHARS.toLocaleString()} characters).`
      );
      return;
    }
    setError(null);
    setShowPaste(false);
    const file = buildPastedTextFile({ content: trimmed });
    await processFile(file);
  }

  async function handleWebsiteSubmit() {
    const trimmed = websiteUrl.trim();
    if (!trimmed) return;
    if (!profile) {
      setError("Set up a space before importing a website.");
      return;
    }
    setError(null);
    setShowWebsite(false);
    setWebsiteImportCount(null);
    setStage("processing");
    setStatus("Fetching website pages…");

    try {
      const res = await fetch("/api/documents/import-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          profileId: profile.id,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        documentCount?: number;
        documents?: { documentId: string; fileName: string }[];
        warnings?: string[];
      };
      if (!res.ok) {
        throw new Error(body.error || "Couldn't import that website.");
      }
      const count = body.documentCount ?? body.documents?.length ?? 0;
      setWebsiteImportCount(count);
      setWebsiteUrl("");
      void kickDocumentProcessingJobs(5);
      setSavedProfileId(profile.id);
      stagingProfileIdRef.current = null;
      setStatus(
        count === 1
          ? "Imported 1 page. Guardian is analyzing it…"
          : `Imported ${count} pages. Guardian is analyzing them…`
      );
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Website import failed.");
      setStage("input");
      setShowWebsite(true);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void processFile(file);
  }

  if (profilesLoading) {
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/add" />
      </div>
    );
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Add Anything
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Upload, paste, import a website, or capture into{" "}
          {profile ? profileContainerName(profile) : "your Space"} — then Ask
          Gideon can use it.
        </p>
      </header>

      {error ? (
        <p
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {stage === "input" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="simple-home-card flex flex-col items-start gap-3 p-5 text-left transition hover:border-brand/40 hover:shadow-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <FileText className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Upload file</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  PDF, Word, images into{" "}
                  {profile?.display_name ?? "this Space"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWebsite(false);
                setShowPaste(true);
              }}
              aria-expanded={showPaste}
              className={`simple-home-card flex flex-col items-start gap-3 p-5 text-left transition hover:border-brand/40 hover:shadow-card ${
                showPaste ? "border-brand/50 ring-2 ring-brand/20" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Plus className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Paste text</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Notes or copied content into{" "}
                  {profile?.display_name ?? "this Space"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPaste(false);
                setShowWebsite(true);
              }}
              aria-expanded={showWebsite}
              className={`simple-home-card flex flex-col items-start gap-3 p-5 text-left transition hover:border-brand/40 hover:shadow-card ${
                showWebsite ? "border-brand/50 ring-2 ring-brand/20" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Globe className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Import website</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Pull public pages into {profile?.display_name ?? "this Space"}
                </span>
              </span>
            </button>
            <Link
              href={
                profile
                  ? `/dashboard?camera=1#documents-${profile.id}`
                  : "/dashboard?camera=1"
              }
              className="simple-home-card flex flex-col items-start gap-3 p-5 text-left transition hover:border-brand/40 hover:shadow-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Camera className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Take photo</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Use your camera to capture a document
                </span>
              </span>
            </Link>
          </div>

          {showPaste ? (
            <form
              ref={pastePanelRef}
              className="simple-home-card scroll-mt-24 space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handlePasteSubmit();
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <label htmlFor="paste-text" className="text-sm font-semibold">
                  Paste your text
                </label>
                <button
                  type="button"
                  onClick={() => setShowPaste(false)}
                  className="text-xs font-medium text-ink-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <textarea
                ref={pasteTextareaRef}
                id="paste-text"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder="Paste anything Guardian should remember…"
                className="w-full rounded-xl border border-border-subtle px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <button
                type="submit"
                disabled={!pasteText.trim()}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Submit
              </button>
            </form>
          ) : null}

          {showWebsite ? (
            <form
              ref={websitePanelRef}
              className="simple-home-card scroll-mt-24 space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleWebsiteSubmit();
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <label htmlFor="website-url" className="text-sm font-semibold">
                  Website URL
                </label>
                <button
                  type="button"
                  onClick={() => setShowWebsite(false)}
                  className="text-xs font-medium text-ink-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                Guardian fetches public pages from this site (up to 8) and saves
                them in {profile?.display_name ?? "your Space"} so Ask Gideon can
                use them as sources. Only import sites you own or have permission
                to use.
              </p>
              <input
                ref={websiteInputRef}
                id="website-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://kendallcapital.com"
                className="w-full rounded-xl border border-border-subtle px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <button
                type="submit"
                disabled={!websiteUrl.trim()}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Import website
              </button>
            </form>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { icon: Mic, label: "Voice note" },
                { icon: Mail, label: "Email ingestion" },
                { icon: ScanLine, label: "Scan document" },
              ] as const
            ).map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                disabled
                title="Coming soon"
                className="simple-home-card flex flex-col items-start gap-3 p-5 text-left opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-ink-muted">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Coming soon
                  </span>
                </span>
              </button>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={VAULT_FILE_ACCEPT}
            className="sr-only"
            onChange={onFileChange}
          />
          <p className="text-xs text-ink-muted">
            Max file size {Math.round(VAULT_MAX_SIZE_BYTES / (1024 * 1024))} MB.
            Supported: PDF, images, plain text, JSON.
          </p>
        </>
      ) : null}

      {stage === "processing" ? (
        <div className="simple-home-card flex flex-col items-center gap-4 p-8 text-center">
          <GuardianIcon size={40} pulse />
          <div>
            <p className="text-sm font-semibold text-foreground">Analyzing…</p>
            <p className="mt-1 text-sm text-ink-muted">
              {status || "Guardian is reading your content"}
            </p>
          </div>
          <ul className="text-left text-xs text-ink-muted">
            {status.toLowerCase().includes("website") ||
            status.toLowerCase().includes("fetching") ? (
              <>
                <li>Loading public pages</li>
                <li>Extracting readable text</li>
                <li>Saving pages into your Space</li>
              </>
            ) : (
              <>
                <li>Extracting document type</li>
                <li>Identifying people and entities</li>
                <li>Matching to your spaces</li>
              </>
            )}
          </ul>
          {snapshot?.processingTrace ? (
            <ProcessingTracePanel trace={snapshot.processingTrace} compact />
          ) : null}
          {processingSlow ? (
            <div className="w-full space-y-2 border-t border-border-subtle pt-4">
              <p className="text-xs text-ink-muted">
                This is taking longer than usual. Your file is saved — you can
                keep waiting or continue while analysis finishes in the
                background.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => finishProcessingEarly()}
                  className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                >
                  Continue anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProcessingDocId(null);
                    pendingUploadRef.current = null;
                    setProcessingSlow(false);
                    setStage("input");
                    setStatus("");
                  }}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-stone-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === "recommend" && presentation ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Guardian thinks this belongs in:
              </p>
              <p className="mt-1 text-lg font-semibold text-brand-dark">
                {presentation.profilePath ?? presentation.workspaceLabel}
              </p>
              {presentation.suggestion?.reason ? (
                <p className="mt-2 text-sm text-ink-muted">
                  <span className="font-medium">Reason:</span>{" "}
                  {presentation.suggestion.reason}
                </p>
              ) : null}
            </div>
          </div>
          <SmartUploadSuggestionCard
            presentation={presentation}
            saveLabel="Save here"
            chooseAnotherLabel="Choose another space"
            onChooseAnother={() => setChooseOpen(true)}
            onSaved={({ movedToProfileId }) => {
              setSavedProfileId(
                movedToProfileId ??
                  stagingProfileIdRef.current ??
                  profile?.id ??
                  null
              );
              stagingProfileIdRef.current = null;
              setStage("done");
            }}
            onKeepHere={() => {
              // File stays in the Space it was uploaded to (active Space).
              setSavedProfileId(
                stagingProfileIdRef.current ?? profile?.id ?? null
              );
              stagingProfileIdRef.current = null;
              setStage("done");
            }}
            onError={setError}
          />
        </div>
      ) : null}

      {stage === "done" ? (
        <div className="simple-home-card space-y-4 p-6 text-center">
          <p className="text-lg font-semibold text-foreground">Saved!</p>
          <p className="text-sm text-ink-muted">
            {websiteImportCount != null
              ? websiteImportCount === 1
                ? "Imported 1 website page into this Space. Ask Gideon can use it once indexing finishes (after analysis)."
                : `Imported ${websiteImportCount} website pages into this Space. Ask Gideon can use them once indexing finishes (after analysis).`
              : `Guardian saved your content in ${profile?.display_name ?? "this Space"}. Ask Gideon can use it once indexing finishes.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {savedProfileId ? (
              <Link
                href={documentsHref(savedProfileId)}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                View in space
              </Link>
            ) : null}
            <Link
              href={
                savedProfileId
                  ? `${ASK_GIDEON_PATH}?profileId=${encodeURIComponent(savedProfileId)}`
                  : ASK_GIDEON_PATH
              }
              className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Ask Gideon
            </Link>
            <button
              type="button"
              onClick={() => {
                setStage("input");
                setPresentation(null);
                setPasteText("");
                setWebsiteUrl("");
                setWebsiteImportCount(null);
                setProcessingDocId(null);
              }}
              className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Add more
            </button>
          </div>
        </div>
      ) : null}

      {chooseOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">
              Where should Guardian remember this?
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Choose a Space or Workspace. Guardian won&apos;t create a new one
              without your confirmation.
            </p>
            <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {topLevelProfiles(profiles).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChooseOpen(false);
                      router.push(documentsHref(p.id));
                    }}
                    className="flex w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-brand-light/40"
                  >
                    <span className="font-medium">{profileContainerName(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setChooseOpen(false)}
              className="mt-4 w-full rounded-xl border border-stone-200 py-2.5 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
