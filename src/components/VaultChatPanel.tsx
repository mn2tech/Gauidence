Warning: truncated output (original token count: 52358)
Total output lines: 5894

"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PlanLimitAlert from "@/components/PlanLimitAlert";
import SimpleNavigation from "@/components/simple-home/SimpleNavigation";
import GuardianIcon from "@/components/brand/GuardianIcon";
import { useSimpleHomeEnabled } from "@/hooks/useSimpleHomeEnabled";
import {
  Brain,
  ExternalLink,
  FileUp,
  Camera,
  Bell,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  Mic,
  NotebookPen,
  Paperclip,
  Plus,
  Send,
  X,
  ArrowRightLeft,
  PanelRightOpen,
  MoreHorizontal,
  Home,
  Inbox,
  Lock,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GideonAvatar from "@/components/GideonAvatar";
import GideonWelcome from "@/components/gideon-welcome/GideonWelcome";
import GideonThinkingPanel from "@/components/GideonThinkingPanel";
import GideonActionTimeline, {
  type ActionTimelineItem,
} from "@/components/GideonActionTimeline";
import GideonProactiveSuggestions, {
  type ProactiveSuggestionItem,
} from "@/components/GideonProactiveSuggestions";
import GideonWorkspaceTimeline, {
  type WorkspaceTimelineItem,
} from "@/components/GideonWorkspaceTimeline";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import VaultChatDrawer from "@/components/VaultChatDrawer";
import VaultChatImportModal from "@/components/VaultChatImportModal";
import ImminentReminderBanner from "@/components/ImminentReminderBanner";
import {
  AskTitleProfileSwitch,
  AskWelcomeProfileSwitch,
} from "@/components/ProfileSwitcher";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  VAULT_CREATE_CARDS,
  canEditGuardianProfile,
  topLevelProfiles,
  vaultCreateHref,
} from "@/lib/profiles/types";
import {
  EMPTY_VAULT_BODY,
  EMPTY_VAULT_HEADLINE,
  FIRST_MEMORY_ACTIONS,
  FIRST_MEMORY_PROMPT,
  GIDEON_BRAND_LINE,
  GIDEON_LOADING_STATES,
  GIDEON_RETURNING_PROMPT,
  GIDEON_WHY,
  ORGANIZE_EXAMPLES,
  ORGANIZE_INTRO,
  PRIVACY_CARD_POINTS,
  PRIVACY_CARD_TITLE,
  TRY_GUARDIAN_EXAMPLES,
  TRY_GUARDIAN_SUBTITLE,
  TRY_GUARDIAN_TITLE,
  WELCOME_AI_MEMORY_BODY,
  WELCOME_AI_MEMORY_TITLE,
  parseGideonSections,
  type FirstMemoryActionId,
} from "@/lib/vault/gideon";
import {
  readGideonWelcomeSeen,
  writeGideonWelcomeSeen,
} from "@/lib/vault/gideonWelcomeClient";
import {
  GIDEON_CHIEF_OF_STAFF_TAGLINE,
  GIDEON_QUICK_ACTIONS,
  type GideonQuickAction,
} from "@/lib/gideon/chiefOfStaff";
import { hasBinaryFollowUp } from "@/lib/gideon/binaryFollowUp";
import GideonFocusCountdown from "@/components/GideonFocusCountdown";
import {
  latestFocusBlockFromMessages,
  parseFocusBlockStart,
  readStoredFocusBlock,
  stripFocusBlockSection,
  writeStoredFocusBlock,
  type GideonFocusBlock,
} from "@/lib/gideon/focusBlock";
import { isImageFileName } from "@/lib/vault/images";
import { hydrateVaultChatMessages } from "@/lib/vault/chatAttachments";
import {
  citationNamedInText,
  extractExplicitSourceFileNames,
} from "@/lib/vault/retrieve";
import {
  connectorFilePreviewPath,
  isConnectorCitationDocumentId,
  preferChartsMatchingKeyInText,
} from "@/lib/ontology/connectorCitationIds";
import { extractYouTubeUrls } from "@/lib/ontology/pipeline/youtubeUrls";
import { renderPdfThumbnailFromFile, renderPdfThumbnailFromUrl } from "@/lib/vault/pdfThumbnail";
import GideonCompactAnswer from "@/components/GideonCompactAnswer";
import { clipboardImageToFile } from "@/lib/vault/clipboardImage";
import {
  uploadAndAnalyzeToVault,
  resolveVaultFileMimeType,
  VAULT_ACCEPTED_TYPES,
  VAULT_FILE_ACCEPT,
  VAULT_UNSUPPORTED_TYPE_MESSAGE,
  type VaultUploadResult,
} from "@/lib/vault/clientUpload";
import SmartUploadSuggestionCard from "@/components/SmartUploadSuggestionCard";
import WorkspaceContextBar from "@/components/WorkspaceContextBar";
import GlobalVaultSearch from "@/components/GlobalVaultSearch";
import { buildWorkingInDisplay } from "@/lib/workspace-context/client";
import {
  DEFAULT_SEARCH_SCOPE,
  type SearchScopeMode,
} from "@/lib/workspace-context/client";
import {
  buildSmartUploadPresentation,
  shouldPromptSmartUpload,
} from "@/lib/actions/client";
import { recordClientActionEvent } from "@/lib/actions/client";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import AskGideonSidebar from "@/components/AskGideonSidebar";
import { todayLogDate } from "@/lib/logs/types";
import {
  parseProposedDailyLog,
  proposedDailyLogSummary,
  stripProposedDailyLogSection,
  type ProposedDailyLog,
} from "@/lib/logs/propose";
import { calendarDateInZone } from "@/lib/reminders/time";
import {
  parseProposedReminder,
  proposedReminderWhenLabel,
  stripProposedReminderSection,
  type ProposedReminder,
} from "@/lib/reminders/propose";
import {
  parseProposedWorkMemoryUpdate,
  proposedWorkMemoryUpdateSummary,
  stripProposedWorkMemoryUpdateSection,
  type ProposedWorkMemoryUpdate,
} from "@/lib/work-memory/propose";
import {
  parseProposedClientRequestReply,
  proposedClientRequestReplySummary,
  stripProposedClientRequestReplySection,
  type ProposedClientRequestReply,
} from "@/lib/client-requests/propose";
import {
  parseProposedClientRequestCreate,
  proposedClientRequestCreateSummary,
  stripProposedClientRequestCreateSection,
  type ProposedClientRequestCreate,
} from "@/lib/client-requests/proposeCreate";
import {
  defaultParentChoice,
  parseProposedSpaceCreate,
  profileTypeRequiresParent,
  proposedSpaceCreateSummary,
  spaceCreateNeedsPlacementPicker,
  spaceCreatePlacementLabel,
  stripProposedSpaceCreateSection,
  validParentProfilesForChild,
  type ProposedSpaceCreate,
} from "@/lib/profiles/proposeCreate";
import { getContainerLabel } from "@/lib/profiles/containerLabels";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { dispatchAwardsFromResponse } from "@/lib/awards/client";
import {
  consumeVaultChatStream,
  isVaultChatStreamResponse,
} from "@/lib/vault/vaultChatStream";
import { useGideonVoiceInput } from "@/hooks/useGideonVoiceInput";
import { useGideonSpeechOutput } from "@/hooks/useGideonSpeechOutput";
import GideonAssistantActions from "@/components/GideonAssistantActions";
import AgentModeToggle from "@/components/AgentModeToggle";
import GideonChatThemeToggle from "@/components/GideonChatThemeToggle";
import { useAgentMode } from "@/hooks/useAgentMode";
import { useGideonChatTheme } from "@/hooks/useGideonChatTheme";
import {
  formatAssistantMessagePlainText,
  formatAssistantMessageSpeechText,
} from "@/lib/vault/assistantMessageText";
import {
  snippetFromAssistantPlainText,
  titleFromAssistantPlainText,
} from "@/lib/vault/actionTitle";
import { askSpaceHref, documentsHref, VAULT_NAV_LABEL } from "@/lib/routes";
import {
  HISTORY_PATH,
  INBOX_PATH,
  SIMPLE_HOME_PATH,
  VAULTS_PATH,
} from "@/lib/simple-home/routing";
import { FIRST_MINUTE_HOLDING } from "@/lib/guardian-today/firstMinute";
import { practiceStatsListPrompt } from "@/lib/vault/askInventory";
import type { WorkProject } from "@/lib/work-memory/types";
import OnboardingProgressChip from "@/components/OnboardingProgressChip";
import FirstWinCard from "@/components/FirstWinCard";
import EmptyAskGuidanceChips from "@/components/EmptyAskGuidanceChips";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import {
  autoQuestionForUpload,
} from "@/lib/onboarding/intent";
import {
  buildSampleDocumentFile,
  pickFirstWinHighlights,
  readFirstWinSeen,
  writeFirstWinSeen,
  type FirstWinFactInput,
  type FirstWinHighlight,
} from "@/lib/onboarding/sampleDocument";
import { trackOnboardingEvent } from "@/lib/onboarding/events";

function defaultReminderDateTime(timeZone: string = GUARDIAN_TIME_ZONE): {
  date: string;
  time: string;
} {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const date = calendarDateInZone(inOneHour, timeZone);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(inOneHour);
  return { date, time };
}

type Citation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  isImage?: boolean;
  kind?: "vault" | "connector";
  sourceId?: string;
  itemId?: string;
  sourceType?: string;
  mimeType?: string | null;
  cardName?: string | null;
};

type VaultMessageAttachment = {
  documentId: string;
  fileName: string;
  kind: "image" | "document";
  mimeType?: string | null;
  previewUrl?: string | null;
};

function fileTypeBadge(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "FILE";
  if (ext === "JPEG") return "JPG";
  return ext;
}

function isPendingAttachmentId(documentId: string): boolean {
  return documentId.startsWith("local-");
}

function messageAttachments(message: VaultMessage): VaultMessageAttachment[] {
  if (message.attachments?.length) return message.attachments;
  return message.attachment ? [message.attachment] : [];
}

function overlayOptimisticAttachment(
  message: VaultMessage,
  optimistic: VaultMessageAttachment | undefined,
  userContent: string
): VaultMessage {
  const hydrated = hydrateVaultChatMessages([message])[0]!;
  if (hydrated.role !== "user" || !optimistic) return hydrated;
  const attachments = messageAttachments(hydrated);
  const hasDoc = attachments.some((item) => item.documentId === optimistic.documentId);
  const nextAttachments = hasDoc
    ? attachments.map((item) =>
        item.documentId === optimistic.documentId
          ? {
              ...item,
              previewUrl: optimistic.previewUrl ?? item.previewUrl,
              fileName: optimistic.fileName || item.fileName,
              kind: optimistic.kind || item.kind,
            }
          : item
      )
    : [optimistic, ...attachments];
  return {
    ...hydrated,
    content: userContent || hydrated.content,
    attachments: nextAttachments,
    attachment: nextAttachments[0] ?? null,
  };
}

function VaultAttachmentCard({
  documentId,
  fileName,
  kind,
  previewUrl,
  compact = true,
  citationKind,
  sourceId,
  itemId,
  displayName,
}: {
  documentId: string;
  fileName: string;
  kind: "image" | "document";
  previewUrl?: string | null;
  compact?: boolean;
  citationKind?: "vault" | "connector";
  sourceId?: string;
  itemId?: string;
  /** Song/card title for connector charts (shown instead of opaque trello*.jpg). */
  displayName?: string | null;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = kind === "image" || isImageFileName(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  const pending = isPendingAttachmentId(documentId);
  const label =
    (displayName && displayName.trim()) ||
    fileName;
  const connectorPreview =
    (citationKind === "connector" || isConnectorCitationDocumentId(documentId)) &&
    sourceId &&
    itemId
      ? connectorFilePreviewPath(sourceId, itemId)
      : null;
  const [pdfThumb, setPdfThumb] = useState<string | null>(
    isPdf && previewUrl ? previewUrl : null
  );

  useEffect(() => {
    setImageFailed(false);
    if (pending) {
      setSignedUrl(null);
      return;
    }
    if (connectorPreview) {
      setSignedUrl(connectorPreview);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled && isImage) setImageFailed(true);
        return;
      }
      const { data: doc } = await supabase
        .from("documents")
        .select("file_path")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc?.file_path) {
        if (!cancelled && isImage) setImageFailed(true);
        return;
      }
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 300);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        if (isImage) setImageFailed(true);
        return;
      }
      setSignedUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, pending, isImage, connectorPreview]);

  useEffect(() => {
    if (!isPdf || pdfThumb || !signedUrl) return;
    let cancelled = false;
    void renderPdfThumbnailFromUrl(signedUrl, 120).then((url) => {
      if (!cancelled && url) setPdfThumb(url);
    });
    return () => {
      cancelled = true;
    };
  }, [isPdf, pdfThumb, signedUrl]);

  useEffect(() => {
    if (isPdf && previewUrl) setPdfThumb(previewUrl);
  }, [isPdf, previewUrl]);

  const badge = fileTypeBadge(fileName);
  const shell = compact
    ? "inline-flex w-[8.5rem] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
    : "block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm";
  const href = signedUrl ?? (isImage ? previewUrl : null);
  const visualSrc = isImage ? signedUrl ?? previewUrl : pdfThumb;

  if (imageFailed && isImage) {
    return (
      <div className={`${shell} p-2 text-[10px] text-ink-muted`} title={label}>
        Couldn&apos;t load preview
      </div>
    );
  }

  const thumb = (
    <>
      <div
        className={`relative bg-stone-50 ${
          compact ? "h-24 w-full" : "min-h-[8rem] w-full"
        }`}
      >
        {visualSrc ? (
          <img
            src={visualSrc}
            alt={label}
            className={
              compact
                ? "h-full w-full object-cover object-top"
                : "max-h-72 w-full object-contain"
            }
            onError={() => {
              if (isImage && previewUrl && visualSrc === previewUrl && !pending) {
                return;
              }
              setImageFailed(true);
            }}
          />
        ) : isImage && (pending || !signedUrl) ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
          </div>
        ) : isPdf && !pdfThumb ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileText className="h-8 w-8 text-brand" />
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] font-semibold text-foreground shadow-sm">
          {badge}
        </span>
      </div>
      <p
        className="truncate px-1.5 py-1 text-[10px] font-medium leading-tight text-foreground"
        title={label}
      >
        {label}
      </p>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={shell}
        title={label}
      >
        {thumb}
      </a>
    );
  }

  return (
    <div className={shell} title={label}>
      {thumb}
    </div>
  );
}

type VaultMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  suggestedQuestions?: string[] | null;
  attachment?: VaultMessageAttachment | null;
  attachments?: VaultMessageAttachment[] | null;
  vaultScope?: {
    profileId: string;
    profileName: string;
    activeProfileName: string;
  } | null;
  created_at: string;
};

type PendingVaultAttachment = {
  file: File;
  previewUrl: string | null;
  kind: "image" | "document";
};

function isImageUpload(file: File): boolean {
  return file.type.startsWith("image/");
}

function attachShortcutLabel(): string {
  if (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  ) {
    return "⌘U";
  }
  return "Ctrl+U";
}

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  imported_from?: "chatgpt" | "claude" | null;
};

type Meta = {
  firstName: string | null;
  documentCount: number;
  photoCount?: number;
  logCount?: number;
  documentNames?: string[];
  photoNames?: string[];
  logNames?: string[];
  documentNamesMore?: number;
  photoNamesMore?: number;
  logNamesMore?: number;
  suggestions: string[];
  quickActions?: GideonQuickAction[];
  connectedItemCount?: number;
  practiceStats?: {
    songCount: number;
    jpgCount: number;
    pngCount: number;
    pdfCount: number;
    chartCount: number;
    analyzedItemCount: number;
    songTitles: string[];
  } | null;
  practiceStatsLine?: string | null;
  boardName?: string | null;
  musicPractice?: boolean;
  profileId?: string;
  profileName?: string;
  askContextLabel?: string;
  chatContextLabel?: string;
  vaultScopeNote?: string;
  searchScope?: SearchScopeMode;
  templateLabel?: string;
  templateBadge?: string;
  chatScopedProfile?: {
    profileId: string;
    profileName: string;
  } | null;
  guidance?: {
    headline: string;
    intro: string;
    tips: string[];
    badge?: string;
    label?: string;
    suggestedUploads?: string[];
  } | null;
  actionTimeline?: ActionTimelineItem[];
  proactiveSuggestions?: ProactiveSuggestionItem[];
  workspaceTimeline?: WorkspaceTimelineItem[];
};

function NameList({
  names,
  more,
}: {
  names: string[];
  more: number;
}) {
  if (names.length === 0) return null;
  return (
    <p className="text-[11px] leading-relaxed text-ink-muted">
      {names.join(" · ")}
      {more > 0 ? ` · +${more} more` : ""}
    </p>
  );
}

function PracticeStatsChips({
  stats,
  boardName,
  disabled,
  onAsk,
}: {
  stats: {
    songCount: number;
    jpgCount: number;
    pngCount: number;
    pdfCount: number;
  };
  boardName?: string | null;
  disabled?: boolean;
  onAsk: (prompt: string) => void;
}) {
  const chipClass =
    "rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {stats.songCount > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAsk(practiceStatsListPrompt("songs", boardName))}
          className={chipClass}
          title="Show song list"
        >
          {stats.songCount} songs
        </button>
      ) : null}
      {stats.jpgCount > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAsk(practiceStatsListPrompt("jpg", boardName))}
          className={chipClass}
          title="List JPG charts"
        >
          {stats.jpgCount} JPGs
        </button>
      ) : null}
      {stats.pngCount > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAsk(practiceStatsListPrompt("png", boardName))}
          className={chipClass}
          title="List PNG charts"
        >
          {stats.pngCount} PNGs
        </button>
      ) : null}
      {stats.pdfCount > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAsk(practiceStatsListPrompt("pdf", boardName))}
          className={chipClass}
          title="List PDF charts"
        >
          {stats.pdfCount} PDFs
        </button>
      ) : null}
    </div>
  );
}

type Props = {
  variant?: "embedded" | "page" | "drawer";
  /** Chat as this vault without switching the app-wide active profile. */
  scopedProfileId?: string;
  /** Side panel: do not resume URL or prior threads; start a new chat. */
  startFreshChat?: boolean;
};

/* Tint against --surface so dark Ask theme keeps light text readable. */
const SECTION_STYLES: Record<string, string> = {
  from_documents: "border-brand/30 bg-brand-light/40",
  from_daily_log:
    "border-emerald-500/30 bg-[color-mix(in_srgb,#10b981_14%,var(--surface))]",
  from_profiles:
    "border-teal-500/30 bg-[color-mix(in_srgb,#14b8a6_14%,var(--surface))]",
  from_work_memory:
    "border-indigo-500/30 bg-[color-mix(in_srgb,#6366f1_14%,var(--surface))]",
  from_ontology:
    "border-cyan-500/30 bg-[color-mix(in_srgb,#06b6d4_14%,var(--surface))]",
  calculated:
    "border-sky-500/30 bg-[color-mix(in_srgb,#0ea5e9_14%,var(--surface))]",
  general_knowledge: "border-border-subtle bg-surface",
  suggestion:
    "border-violet-500/35 bg-[color-mix(in_srgb,#8b5cf6_16%,var(--surface))]",
  needs_verification:
    "border-amber-500/35 bg-[color-mix(in_srgb,#f59e0b_16%,var(--surface))]",
  body: "border-transparent bg-transparent",
};

function vaultChatApiUrl(
  params?: Record<string, string | undefined>,
  scopedProfileId?: string | null,
  options?: { omitProfileId?: boolean }
): string {
  const sp = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) sp.set(key, value);
    }
  }
  if (scopedProfileId && !options?.omitProfileId) {
    sp.set("profileId", scopedProfileId);
  }
  const query = sp.toString();
  return `/api/documents/vault-chat${query ? `?${query}` : ""}`;
}

function withVaultChatProfileId<T extends Record<string, unknown>>(
  body: T,
  scopedProfileId?: string | null
): T & { profileId?: string } {
  if (!scopedProfileId) return body;
  return { ...body, profileId: scopedProfileId };
}

function vaultChatStorageKey(profileId: string): string {
  return `gideon:lastChat:${profileId}`;
}

function readRememberedVaultChat(profileId: string | null): string | null {
  if (!profileId || typeof window === "undefined") return null;
  return (
    localStorage.getItem(vaultChatStorageKey(profileId)) ??
    sessionStorage.getItem(vaultChatStorageKey(profileId))
  );
}

function rememberVaultChat(profileId: string | null, chatId: string | null) {
  if (!profileId || !chatId || typeof window === "undefined") return;
  localStorage.setItem(vaultChatStorageKey(profileId), chatId);
  sessionStorage.setItem(vaultChatStorageKey(profileId), chatId);
}

function forgetVaultChat(profileId: string | null) {
  if (!profileId || typeof window === "undefined") return;
  localStorage.removeItem(vaultChatStorageKey(profileId));
  sessionStorage.removeItem(vaultChatStorageKey(profileId));
}

function confirmedDailyLogsStorageKey(chatId: string): string {
  return `gideon:confirmedDailyLogs:${chatId}`;
}

function readConfirmedDailyLogIds(chatId: string | null): Set<string> {
  if (!chatId || typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(confirmedDailyLogsStorageKey(chatId));
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function writeConfirmedDailyLogIds(chatId: string | null, ids: Set<string>) {
  if (!chatId || typeof window === "undefined") return;
  sessionStorage.setItem(
    confirmedDailyLogsStorageKey(chatId),
    JSON.stringify([...ids])
  );
}

function isChatNotFoundError(message: string): boolean {
  return message === "Chat not found." || message === "Chat not found";
}

const GIDEON_GENERIC_REQUEST_ERROR =
  "Gideon couldn't complete that request. Please try again.";

/** Map browser/network/raw errors to user-facing copy without masking auth errors. */
function friendlyGideonError(message: string | null | undefined, code?: string): string {
  const raw = (message ?? "").trim();
  if (code === "unauthorized" || code === "forbidden" || /not authorized|forbidden|permission|access denied/i.test(raw)) {
    return raw || "You don't have permission to do that in this space.";
  }
  if (
    !raw ||
    /^failed to fetch$/i.test(raw) ||
    /^networkerror/i.test(raw) ||
    /^load failed$/i.test(raw) ||
    /^network error$/i.test(raw) ||
    /networkrequestfailed/i.test(raw) ||
    /err_network|econnrefused|econnreset|etimedout/i.test(raw)
  ) {
    return GIDEON_GENERIC_REQUEST_ERROR;
  }
  return raw;
}

function readUrlChatId(): string | null {
  if (typeof window === "undefined") return null;
  const chatId = new URLSearchParams(window.location.search).get("chatId");
  return chatId?.trim() ? chatId.trim() : null;
}

function readUrlProfileId(): string | null {
  if (typeof window === "undefined") return null;
  const profileId = new URLSearchParams(window.location.search).get("profileId");
  return profileId?.trim() ? profileId.trim() : null;
}

function clearStaleChatPointer(
  chatId: string,
  profileId: string | null,
  syncUrl: (chatId: string | null) => void
) {
  if (readRememberedVaultChat(profileId) === chatId) {
    forgetVaultChat(profileId);
  }
  if (readUrlChatId() === chatId) {
    syncUrl(null);
  }
}

const ASK_SIDEBAR_COLLAPSED_KEY = "guardian.askSidebarCollapsed";

function readAskSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(ASK_SIDEBAR_COLLAPSED_KEY);
    // Focus Ask defaults to collapsed chrome.
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistAskSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(ASK_SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function VaultChatPanel({
  variant = "embedded",
  scopedProfileId,
  startFreshChat = false,
}: Props) {
  const isPage = variant === "page";
  const isDrawer = variant === "drawer";
  const isScopedPanel = Boolean(scopedProfileId) || isDrawer;
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedChatId = isScopedPanel ? null : searchParams.get("chatId");
  const requestedProfileId = isScopedPanel ? null : searchParams.get("profileId");
  const requestedWorkProjectId = isScopedPanel
    ? null
    : searchParams.get("projectId");
  const requestedRequestId = isScopedPanel
    ? null
    : searchParams.get("requestId");
  const requestedDraft = isScopedPanel ? null : searchParams.get("draft");
  const requestedWorldEntityId = isScopedPanel
    ? null
    : searchParams.get("worldEntityId");
  const requestedDocumentId = isScopedPanel
    ? null
    : searchParams.get("documentId");
  const worldEntityIdForSendRef = useRef<string | null>(null);
  const documentIdForSendRef = useRef<string | null>(null);
  const { active, profiles, loading: profilesLoading, switchProfile, refresh, timeZone, timeZoneLabel } =
    useActiveProfile();
  const { progress: onboardingProgress, refresh: refreshOnboarding } =
    useOnboardingProgress();
  const needsSetup = !profilesLoading && profiles.length === 0;
  const { enabled: simpleHomeEnabled } = useSimpleHomeEnabled();
  // Same bottom nav as Today so Ask ↔ Today is obvious (not buried in ⋯).
  const reserveSimpleNav =
    isPage && simpleHomeEnabled && !needsSetup;
  const bootstrapTried = useRef(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [focusBlock, setFocusBlock] = useState<GideonFocusBlock | null>(null);
  const dismissedFocusEndsAtRef = useRef<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(
    null
  );
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [thinkingActiveIndex, setThinkingActiveIndex] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState<string>(
    GIDEON_LOADING_STATES[0]
  );
  const [error, setErrorState] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const setError = (message: string | null, code?: string) => {
    if (message === null) setErrorState(null);
    else setErrorState(code ? { message, code } : { message });
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [scopeChromeOpen, setScopeChromeOpen] = useState(false);
  const [gideonWelcomeSeen, setGideonWelcomeSeen] = useState(readGideonWelcomeSeen);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logContent, setLogContent] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const lastWriteProfileIdRef = useRef<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTargetProfileId, setReminderTargetProfileId] = useState<
    string | null
  >(null);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  const [confirmingReminderId, setConfirmingReminderId] = useState<string | null>(
    null
  );
  const [confirmedReminderIds, setConfirmedReminderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [confirmingWorkMemoryId, setConfirmingWorkMemoryId] = useState<
    string | null
  >(null);
  const [confirmedWorkMemoryIds, setConfirmedWorkMemoryIds] = useState<
    Set<string>
  >(() => new Set());
  const [savingWorkMemory, setSavingWorkMemory] = useState(false);
  const [confirmingClientRequestId, setConfirmingClientRequestId] = useState<
    string | null
  >(null);
  const [confirmedClientRequestIds, setConfirmedClientRequestIds] = useState<
    Set<string>
  >(() => new Set());
  const [confirmingDailyLogId, setConfirmingDailyLogId] = useState<string | null>(
    null
  );
  const [confirmedDailyLogIds, setConfirmedDailyLogIds] = useState<Set<string>>(
    () => new Set()
  );
  const pendingDailyLogMessageIdRef = useRef<string | null>(null);
  const [savingClientRequestReply, setSavingClientRequestReply] = useState(false);
  const [confirmingClientRequestCreateId, setConfirmingClientRequestCreateId] =
    useState<string | null>(null);
  const [confirmedClientRequestCreateIds, setConfirmedClientRequestCreateIds] =
    useState<Set<string>>(() => new Set());
  const [createdClientRequestIds, setCreatedClientRequestIds] = useState<
    Map<string, string>
  >(() => new Map());
  const [savingClientRequestCreate, setSavingClientRequestCreate] = useState(false);
  const [confirmingSpaceCreateId, setConfirmingSpaceCreateId] = useState<
    string | null
  >(null);
  const [confirmedSpaceCreateIds, setConfirmedSpaceCreateIds] = useState<
    Set<string>
  >(() => new Set());
  const [createdSpaceProfileIds, setCreatedSpaceProfileIds] = useState<
    Map<string, string>
  >(() => new Map());
  const [spaceCreateParentChoices, setSpaceCreateParentChoices] = useState<
    Map<string, string | null>
  >(() => new Map());
  const [savingSpaceCreate, setSavingSpaceCreate] = useState(false);
  const [firstWin, setFirstWin] = useState<{
    fileName: string;
    summary: string | null;
    highlights: FirstWinHighlight[];
  } | null>(null);
  const [dismissedVaultScopeIds, setDismissedVaultScopeIds] = useState<
    Set<string>
  >(() => new Set());
  const [switchingVaultScopeId, setSwitchingVaultScopeId] = useState<
    string | null
  >(null);
  const [sideVault, setSideVault] = useState<{
    profileId: string;
    profileName: string;
  } | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingVaultAttachment | null>(null);
  const [pendingSmartUpload, setPendingSmartUpload] = useState<{
    result: VaultUploadResult;
    file: File;
    attachmentPreview?: string | null;
    userMsgId?: string;
    question?: string;
    userDisplayContent?: string;
    wasEmpty: boolean;
  } | null>(null);
  const [workProject, setWorkProject] = useState<WorkProject | null>(null);
  const [vaultSearchOpen, setVaultSearchOpen] = useState(false);
  const { enabled: agentModeEnabled } = useAgentMode();
  const { theme: gideonChatTheme } = useGideonChatTheme();
  const bottomRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const headerMoreRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentRef = useRef<PendingVaultAttachment | null>(null);
  const profileSwitchRef = useRef(false);
  const ignoreUrlProfileRef = useRef(false);
  const skipResumeOnBootstrapRef = useRef(false);
  const deepLinkChatConsumed = useRef<string | null>(null);
  const requestedChatIdRef = useRef<string | null>(requestedChatId);
  const draftAppliedRef = useRef<string | false>(false);
  useEffect(() => {
    if (requestedChatId) requestedChatIdRef.current = requestedChatId;
  }, [requestedChatId]);
  useEffect(() => {
    setFocusBlock(readStoredFocusBlock());
  }, []);
  useEffect(() => {
    setSidebarCollapsed(readAskSidebarCollapsed());
  }, []);
  useEffect(() => {
    writeStoredFocusBlock(focusBlock);
  }, [focusBlock]);
  useEffect(() => {
    const fromMessages = latestFocusBlockFromMessages(messages, timeZone);
    if (
      !fromMessages ||
      fromMessages.endsAt === dismissedFocusEndsAtRef.current
    ) {
      return;
    }
    setFocusBlock((prev) => {
      if (prev && Date.parse(prev.startsAt) >= Date.parse(fromMessages.startsAt)) {
        return prev;
      }
      return fromMessages;
    });
  }, [messages, timeZone]);
  useEffect(() => {
    const seen = readGideonWelcomeSeen();
    if (seen) {
      setGideonWelcomeSeen(true);
      return;
    }
    const hasVaultContent =
      (meta?.documentCount ?? 0) +
        (meta?.photoCount ?? 0) +
        (meta?.logCount ?? 0) >
      0;
    if (hasVaultContent) {
      writeGideonWelcomeSeen(true);
      setGideonWelcomeSeen(true);
    }
  }, [meta?.documentCount, meta?.photoCount, meta?.logCount]);
  const markGideonWelcomeSeen = useCallback(() => {
    if (!readGideonWelcomeSeen()) {
      writeGideonWelcomeSeen(true);
      setGideonWelcomeSeen(true);
    }
  }, []);
  const bootstrapGeneration = useRef(0);
  const bootstrappedVaultRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(sending);
  const activeChatIdRef = useRef(activeChatId);
  messagesRef.current = messages;
  sendingRef.current = sending;
  activeChatIdRef.current = activeChatId;
  const workProjectPrefillDone = useRef(false);
  const sendQuestionRef = useRef<
    (
      questionRaw: string,
      options?: {
        attachment?: VaultMessageAttachment;
        userDisplayContent?: string;
        replaceUserMessageId?: string;
        regenerateAssistantId?: string;
      }
    ) => Promise<void>
  >(async () => {});
  const inputId = isPage
    ? "ask-gideon-page-input"
    : isDrawer
      ? "ask-gideon-drawer-input"
      : "ask-gideon-input";
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const COMPOSER_MAX_LINES = 6;

  const resizeComposerInput = useCallback(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const padding =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const maxHeight = lineHeight * COMPOSER_MAX_LINES + padding;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeComposerInput();
  }, [input, resizeComposerInput]);

  const handleComposerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };
  const scopedProfile = scopedProfileId
    ? profiles.find((p) => p.id === scopedProfileId) ?? null
    : null;
  const effectiveProfile = scopedProfile ?? active;
  const canEditVault = effectiveProfile
    ? canEditGuardianProfile(effectiveProfile)
    : true;
  const profileId = effectiveProfile?.id ?? meta?.profileId ?? null;
  const profileNameForId = (id: string | null | undefined) =>
    profiles.find((p) => p.id === id)?.display_name ?? null;
  const reminderSaveProfileId = reminderTargetProfileId ?? profileId;
  const vaultProfileId =
    scopedProfileId ?? active?.id ?? meta?.profileId ?? null;

  const syncAskProfileUrl = useCallback(
    (profileId: string, options?: { clearChat?: boolean }) => {
      if (isScopedPanel || isDrawer) return;
      ignoreUrlProfileRef.current = true;
      router.replace(askSpaceHref(profileId, searchParams, options), {
        scroll: false,
      });
    },
    [isScopedPanel, isDrawer, router, searchParams]
  );

  const syncAskUrl = useCallback(
    (chatId: string | null) => {
      if (isScopedPanel || isDrawer) return;
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      params.delete("chatId");
      // Keep profileId / draft from the landing URL so Space-scoped welcome chips
      // (and pending auto-send drafts) are not wiped mid-bootstrap.
      if (chatId) params.set("chatId", chatId);
      else params.delete("chatId");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (next !== current) {
        window.history.replaceState(window.history.state, "", next);
      }
      requestedChatIdRef.current = chatId;
      if (chatId) deepLinkChatConsumed.current = chatId;
    },
    [isScopedPanel, isDrawer]
  );
  const syncAskUrlRef = useRef(syncAskUrl);
  syncAskUrlRef.current = syncAskUrl;

  // Welcome / deep-link chips land on /ask?draft=…&profileId=… — auto-send once
  // the target Space is active and history has finished loading.
  useEffect(() => {
    if (requestedWorldEntityId?.trim()) {
      worldEntityIdForSendRef.current = requestedWorldEntityId.trim();
    }
  }, [requestedWorldEntityId]);

  useEffect(() => {
    if (requestedDocumentId?.trim()) {
      documentIdForSendRef.current = requestedDocumentId.trim();
    }
  }, [requestedDocumentId]);

  useEffect(() => {
    if (isScopedPanel) return;
    const draft = requestedDraft?.trim();
    if (!draft) {
      draftAppliedRef.current = false;
      return;
    }
    // Allow a new chip click (different draft) after a prior auto-send.
    if (draftAppliedRef.current === draft) return;
    if (profilesLoading || loadingHistory || sending || vaultBusy) return;
    if (!profileId) return;
    const urlProfile = readUrlProfileId();
    if (urlProfile && active?.id !== urlProfile) return;

    draftAppliedRef.current = draft;
    setInput("");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("draft");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(window.history.state, "", next);
    }
    const docId = documentIdForSendRef.current;
    if (docId) {
      void sendQuestionRef.current(draft, {
        attachment: {
          documentId: docId,
          fileName: "Source document",
          kind: "document",
          previewUrl: null,
        },
      });
      documentIdForSendRef.current = null;
    } else {
      void sendQuestionRef.current(draft);
    }
  }, [
    requestedDraft,
    isScopedPanel,
    profilesLoading,
    loadingHistory,
    sending,
    vaultBusy,
    profileId,
    active?.id,
  ]);

  const {
    listening: voiceListening,
    toggle: toggleVoice,
    stop: stopVoice,
    supported: voiceSupported,
  } = useGideonVoiceInput({
    onFinalTranscript: (text) => {
      void sendQuestionRef.current(text);
    },
    onInterimTranscript: setInput,
    onError: (msg) => setError(msg),
    disabled: sending || vaultBusy || loadingHistory || !profileId,
  });
  const {
    speak: speakAssistant,
    stop: stopAssistantSpeech,
    speakingMessageId,
    supported: speechOutputSupported,
  } = useGideonSpeechOutput();
  const docsHref = documentsHref(profileId);

  pendingAttachmentRef.current = pendingAttachment;

  useEffect(() => {
    return () => {
      const previewUrl = pendingAttachmentRef.current?.previewUrl;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const revokePendingPreview = useCallback((previewUrl: string | null) => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, []);

  const clearPendingAttachment = useCallback(() => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) revokePendingPreview(prev.previewUrl);
      return null;
    });
  }, [revokePendingPreview]);

  const stageVaultFile = useCallback(
    (file: File) => {
      if (!profileId || vaultBusy || sending) return;
      setPlusOpen(false);
      setCameraOpen(false);
      if (!VAULT_ACCEPTED_TYPES[resolveVaultFileMimeType(file)]) {
        setError(VAULT_UNSUPPORTED_TYPE_MESSAGE);
        return;
      }
      setError(null);
      setPendingAttachment((prev) => {
        if (prev?.previewUrl) revokePendingPreview(prev.previewUrl);
        const kind = isImageUpload(file) ? "image" : "document";
        const staged: PendingVaultAttachment = {
          file,
          previewUrl: kind === "image" ? URL.createObjectURL(file) : null,
          kind,
        };
        if (file.type === "application/pdf") {
          void renderPdfThumbnailFromFile(file, 120).then((dataUrl) => {
            setPendingAttachment((current) =>
              current?.file === file && dataUrl
                ? { ...current, previewUrl: dataUrl }
                : current
            );
          });
        }
        return staged;
      });
    },
    [profileId, vaultBusy, sending, revokePendingPreview]
  );

  const handleComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLFormElement>) => {
      if (!profileId || vaultBusy || sending || !canEditVault) return;
      const file = clipboardImageToFile(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      stageVaultFile(file);
    },
    [profileId, vaultBusy, sending, canEditVault, stageVaultFile]
  );

  const loadMetaAndChats = useCallback(async () => {
    const res = await fetch(vaultChatApiUrl(undefined, vaultProfileId));
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      chats?: ChatSummary[];
      meta?: Meta;
    };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load Ask Gideon.");
    setChats(body.chats ?? []);
    if (body.meta) setMeta(body.meta);
    return body.chats ?? [];
  }, [vaultProfileId]);

  const loadThread = useCallback(
    async (
      chatId: string,
      options?: {
        bootstrapGeneration?: number;
        allowEmpty?: boolean;
        refresh?: boolean;
        silent?: boolean;
      }
    ): Promise<{ messageCount: number; applied: boolean }> => {
      const generation = options?.bootstrapGeneration;
      const res = await fetch(
        vaultChatApiUrl({ chatId }, vaultProfileId, { omitProfileId: true })
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        chats?: ChatSummary[];
        messages?: VaultMessage[];
        chatId?: string;
        meta?: Partial<Meta>;
      };
      if (
        generation !== undefined &&
        generation !== bootstrapGeneration.current
      ) {
        return { messageCount: 0, applied: false };
      }
      if (!res.ok) {
        const err = new Error(body.error ?? "Couldn't load chat.");
        if (options?.silent || options?.refresh) {
          if (isChatNotFoundError(err.message)) {
            clearStaleChatPointer(
              chatId,
              vaultProfileId,
              syncAskUrlRef.current
            );
          }
          return { messageCount: 0, applied: false };
        }
        throw err;
      }
      if (body.chats) setChats(body.chats);
      const resolvedChatId = body.chatId ?? chatId;
      const serverMessages = hydrateVaultChatMessages(
        (body.messages ?? []) as VaultMessage[]
      );
      let applied = false;

      const applyThread = () => {
        setActiveChatId(resolvedChatId);
        setMessages(serverMessages);
        syncAskUrlRef.current(resolvedChatId);
        const storageProfileId =
          body.meta?.profileId ?? vaultProfileId ?? null;
        rememberVaultChat(storageProfileId, resolvedChatId);
        applied = true;
      };

      if (options?.refresh) {
        if (serverMessages.length > 0) applyThread();
      } else if (options?.bootstrapGeneration !== undefined) {
        const hasLocalMessages =
          messagesRef.current.length > 0 || sendingRef.current;
        if (hasLocalMessages) {
          if (body.chats) setChats(body.chats);
          return { messageCount: 0, applied: false };
        }
        if (serverMessages.length > 0 || options?.allowEmpty) {
          applyThread();
        }
      } else if (serverMessages.length > 0 || options?.allowEmpty) {
        applyThread();
      }
      if (body.meta) {
        setMeta((prev) => ({
          firstName: prev?.firstName ?? null,
          documentCount: 0,
          suggestions: prev?.suggestions ?? [],
          ...prev,
          ...body.meta,
        }));
      }
      return { messageCount: serverMessages.length, applied };
    },
    [vaultProfileId]
  );

  const resumeVaultChat = useCallback(
    async (
      list: ChatSummary[],
      generation: number,
      preferredIds: Array<string | null | undefined>
    ) => {
      const tried = new Set<string>();
      const candidates: string[] = [];
      for (const id of preferredIds) {
        if (!id || tried.has(id)) continue;
        tried.add(id);
        candidates.push(id);
      }
      for (const chat of list) {
        if (tried.has(chat.id)) continue;
        tried.add(chat.id);
        candidates.push(chat.id);
      }

      for (const chatId of candidates) {
        if (generation !== bootstrapGeneration.current) return;
        if (messagesRef.current.length > 0 || sendingRef.current) return;
        try {
          const { applied } = await loadThread(chatId, {
            bootstrapGeneration: generation,
            allowEmpty: true,
          });
          if (applied) return;
        } catch (err) {
          if (generation !== bootstrapGeneration.current) return;
          const message =
            err instanceof Error ? err.message : "Couldn't load Ask Gideon.";
          if (isChatNotFoundError(message)) {
            clearStaleChatPointer(
              chatId,
              vaultProfileId,
              syncAskUrlRef.current
            );
            continue;
          }
          throw err;
        }
      }
    },
    [loadThread, vaultProfileId]
  );

  const bootstrap = useCallback(async () => {
    const generation = ++bootstrapGeneration.current;
    setLoadingHistory(true);
    setError(null);

    try {
      const list = await loadMetaAndChats();
      if (generation !== bootstrapGeneration.current) return;

      const skipResume = skipResumeOnBootstrapRef.current;
      skipResumeOnBootstrapRef.current = false;
      if (startFreshChat || isDrawer || skipResume) return;

      const urlChatId = readUrlChatId();
      const rememberedChatId = readRememberedVaultChat(vaultProfileId);

      if (
        messagesRef.current.length === 0 &&
        !sendingRef.current
      ) {
        if (urlChatId) deepLinkChatConsumed.current = urlChatId;
        await resumeVaultChat(list, generation, [
          ...list.map((c) => c.id),
          urlChatId,
          rememberedChatId,
        ]);
      }
    } catch (err) {
      if (generation !== bootstrapGeneration.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load Ask Gideon.");
    } finally {
      if (generation === bootstrapGeneration.current) {
        setLoadingHistory(false);
      }
    }
  }, [loadMetaAndChats, resumeVaultChat, startFreshChat, isDrawer, vaultProfileId]);

  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  useEffect(() => {
    if (profilesLoading) return;
    if (needsSetup) {
      setLoadingHistory(false);
      return;
    }
    if (scopedProfileId) {
      if (!profiles.some((p) => p.id === scopedProfileId)) return;
      if (bootstrappedVaultRef.current === scopedProfileId) return;
      bootstrappedVaultRef.current = scopedProfileId;
      void bootstrapRef.current();
      return;
    }
    if (!active?.id) return;
    if (bootstrappedVaultRef.current === active.id) return;
    bootstrappedVaultRef.current = active.id;
    void bootstrapRef.current();
  }, [
    needsSetup,
    profilesLoading,
    active?.id,
    scopedProfileId,
    profiles.length,
  ]);

  useEffect(() => {
    if (profilesLoading || profiles.length > 0 || bootstrapTried.current) return;
    bootstrapTried.current = true;
    void refresh();
  }, [profilesLoading, profiles.length, refresh]);

  useEffect(() => {
    if (profilesLoading || needsSetup || profileSwitchRef.current) return;
    if (scopedProfileId) return;
    if (ignoreUrlProfileRef.current) {
      if (!requestedProfileId || active?.id === requestedProfileId) {
        ignoreUrlProfileRef.current = false;
      }
      return;
    }
    // Honor profileId deep links — skip while the user is switching spaces manually.
    if (!requestedProfileId) return;
    if (active?.id === requestedProfileId) return;
    if (!profiles.some((p) => p.id === requestedProfileId)) return;
    profileSwitchRef.current = true;
    void switchProfile(requestedProfileId).finally(() => {
      profileSwitchRef.current = false;
    });
  }, [
    requestedProfileId,
    active?.id,
    profilesLoading,
    needsSetup,
    profiles.length,
    switchProfile,
    scopedProfileId,
  ]);

  useEffect(() => {
    if (!requestedWorkProjectId) {
      setWorkProject(null);
      workProjectPrefillDone.current = false;
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/work-memory/projects/${encodeURIComponent(requestedWorkProjectId)}`
    )
      .then((r) => r.json())
      .then((body: { project?: WorkProject }) => {
        if (!cancelled && body.project) setWorkProject(body.project);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [requestedWorkProjectId]);

  useEffect(() => {
    if (profilesLoading || needsSetup || profileSwitchRef.current) return;
    if (!requestedWorkProjectId || !workProject?.profile_id) return;
    if (requestedProfileId) return;
    if (active?.id === workProject.profile_id) return;
    if (!profiles.some((p) => p.id === workProject.profile_id)) return;
    profileSwitchRef.current = true;
    void switchProfile(workProject.profile_id).finally(() => {
      profileSwitchRef.current = false;
    });
  }, [
    requestedWorkProjectId,
    workProject?.profile_id,
    requestedProfileId,
    active?.id,
    profilesLoading,
    needsSetup,
    profiles,
    switchProfile,
  ]);

  useEffect(() => {
    if (!workProject || workProjectPrefillDone.current) return;
    workProjectPrefillDone.current = true;
    setInput((current) => {
      if (current.trim()) return current;
      const parts = [`I'm resuming work on "${workProject.name}".`];
      if (workProject.next_action?.trim()) {
        parts.push(`My next action is: ${workProject.next_action.trim()}.`);
      }
      if (workProject.blockers?.trim()) {
        parts.push(`I'm blocked by: ${workProject.blockers.trim()}.`);
      }
      parts.push("Help me pick up where I left off.");
      return parts.join(" ");
    });
  }, [workProject]);

  useEffect(() => {
    if (needsSetup || scopedProfileId) return;
    const onProfile = (event: Event) => {
      const nextProfileId = (
        event as CustomEvent<{ profileId?: string }>
      ).detail?.profileId;
      if (nextProfileId && !isScopedPanel && !isDrawer) {
        syncAskProfileUrl(nextProfileId, { clearChat: true });
      }
      bootstrapGeneration.current += 1;
      bootstrappedVaultRef.current = null;
      deepLinkChatConsumed.current = null;
      skipResumeOnBootstrapRef.current = true;
      setChats([]);
      setActiveChatId(null);
      setMessages([]);
      setMeta(null);
      setError(null);
      setLoadingHistory(true);
      syncAskUrlRef.current(null);
    };
    window.addEventListener("guardian:profile-changed", onProfile);
    return () =>
      window.removeEventListener("guardian:profile-changed", onProfile);
  }, [needsSetup, scopedProfileId, isScopedPanel, isDrawer, syncAskProfileUrl]);

  useEffect(() => {
    setConfirmedDailyLogIds(readConfirmedDailyLogIds(activeChatId));
    pendingDailyLogMessageIdRef.current = null;
  }, [activeChatId]);

  const markDailyLogConfirmed = useCallback((messageId: string) => {
    setConfirmedDailyLogIds((prev) => {
      const next = new Set(prev).add(messageId);
      writeConfirmedDailyLogIds(activeChatIdRef.current, next);
      return next;
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, vaultBusy, vaultStatus, savingLog]);

  useEffect(() => {
    if (!sending && !vaultBusy && !savingLog) return;
    if (savingLog) {
      setLoadingLabel("Saving to your space…");
      return;
    }
    if (vaultBusy && vaultStatus) {
      setLoadingLabel(vaultStatus);
      return;
    }
    let i = 0;
    setLoadingLabel(GIDEON_LOADING_STATES[0]);
    const t = window.setInterval(() => {
      i = (i + 1) % GIDEON_LOADING_STATES.length;
      setLoadingLabel(GIDEON_LOADING_STATES[i]!);
    }, 2200);
    return () => window.clearInterval(t);
  }, [sending, vaultBusy, vaultStatus, savingLog]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  useEffect(() => {
    if (!headerMoreOpen) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!headerMoreRef.current?.contains(e.target as Node)) {
        setHeaderMoreOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setHeaderMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [headerMoreOpen]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "u") return;
      if (vaultBusy || sending || !profileId) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          (target.tagName === "INPUT" &&
            target.id !== inputId &&
            (target as HTMLInputElement).type !== "file") ||
          (target.tagName === "TEXTAREA" && target.id !== inputId))
      ) {
        return;
      }
      e.preventDefault();
      setPlusOpen(false);
      fileInputRef.current?.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [vaultBusy, sending, profileId, inputId]);

  const startNewChat = async () => {
    setError(null);
    setActiveChatId(null);
    setMessages([]);
    setDismissedVaultScopeIds(new Set());
    setSidebarOpen(false);
    forgetVaultChat(vaultProfileId);
    syncAskUrl(null);
    try {
      await loadMetaAndChats();
    } catch {
      /* welcome still works */
    }
  };

  const selectChat = async (chatId: string) => {
    setLoadingHistory(true);
    setError(null);
    try {
      const { applied } = await loadThread(chatId, {
        allowEmpty: true,
        silent: true,
      });
      if (!applied) {
        clearStaleChatPointer(chatId, vaultProfileId, syncAskUrl);
        setActiveChatId(null);
        setMessages([]);
        try {
          await loadMetaAndChats();
        } catch {
          /* sidebar refresh is best-effort */
        }
        return;
      }
      setSidebarOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't load chat.";
      setError(message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteChat = async (chatId: string, e: MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      const res = await fetch(vaultChatApiUrl({ chatId }, vaultProfileId), {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        chats?: ChatSummary[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't delete chat.");
        return;
      }
      const next = body.chats ?? [];
      setChats(next);
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
        syncAskUrl(null);
      }
    } catch {
      setError("Couldn't delete chat.");
    }
  };

  const handleImportComplete = async (result: {
    chatIds: string[];
    chats: ChatSummary[];
  }) => {
    setChats(result.chats);
    const firstImported = result.chatIds[0];
    if (firstImported) {
      await selectChat(firstImported);
    }
  };

  const viewSource = async (citation: Citation) => {
    if (
      citation.kind === "connector" &&
      citation.sourceId &&
      citation.itemId
    ) {
      const isTrelloFile =
        citation.sourceType === "trello" ||
        citation.sourceType === "google_drive" ||
        Boolean(citation.mimeType?.includes("pdf")) ||
        /\.(pdf|jpe?g|png|gif|webp)$/i.test(citation.fileName);
      const detailPath = `/settings/connections/${citation.sourceId}/files/${citation.itemId}`;
      if (isTrelloFile) {
        window.open(
          `/api/connections/${citation.sourceId}/items/${citation.itemId}/file`,
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }
      // Device Storage (and non-PDF attachments): open the file detail page
      // where the user can preview / re-grant folder access.
      window.open(detailPath, "_blank", "noopener,noreferrer");
      return;
    }

    const documentId = citation.documentId;
    const fileName = citation.fileName;
    const supabase = createClient();
    if (!supabase) return;
    const { data: doc } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc?.file_path) {
      setError("I couldn't open that source document.");
      return;
    }
    const { data, error: signedError } = await…22358 tokens truncated…</div>
              ) : null}
            </>
          ) : (
            <>
          <p className="text-base font-semibold text-foreground">
            Hi{greetName ? ` ${greetName}` : ""}, I&apos;m Gideon.
          </p>
          <p className="text-[11px] font-medium text-ink-muted">
            {GIDEON_CHIEF_OF_STAFF_TAGLINE}
          </p>
          {meta?.profileName && (
            <AskWelcomeProfileSwitch fallbackName={meta.profileName} />
          )}

          {showExpandedWelcome ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {emptyVault
                    ? (meta?.guidance?.headline ?? WELCOME_AI_MEMORY_TITLE)
                    : (meta?.guidance?.headline ?? "Welcome to your space")}
                </p>
                {templateBadge ? (
                  <span className="inline-flex items-center rounded-full border border-stone-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    {templateBadge}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">
                {meta?.guidance?.intro ?? WELCOME_AI_MEMORY_BODY}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {quickActions.map((action) => (
                  <button
                    key={`expanded-${action.id}`}
                    type="button"
                    disabled={sending || loadingHistory}
                    onClick={() => void sendQuestion(action.prompt)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
            <p className="text-sm leading-relaxed text-ink-muted">
              {GIDEON_RETURNING_PROMPT}
            </p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={`welcome-${action.id}`}
                  type="button"
                  disabled={sending || loadingHistory}
                  onClick={() => void sendQuestion(action.prompt)}
                  className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
            </>
          )}

          {!showPracticeStats &&
          !showMinimalWelcome &&
          !emptyVault &&
          countBits.length > 0 ? (
            <details className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                In this space: {countBits.join(" · ")}
              </summary>
              <div className="mt-2 space-y-2 border-t border-stone-200 pt-2">
                {docCount > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">
                      Documents
                    </p>
                    <NameList
                      names={meta?.documentNames ?? []}
                      more={meta?.documentNamesMore ?? 0}
                    />
                  </div>
                ) : null}
                {photoCount > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">
                      Photos
                    </p>
                    <NameList
                      names={meta?.photoNames ?? []}
                      more={meta?.photoNamesMore ?? 0}
                    />
                  </div>
                ) : null}
                {logCount > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">
                      Daily Logs
                    </p>
                    <NameList
                      names={meta?.logNames ?? []}
                      more={meta?.logNamesMore ?? 0}
                    />
                  </div>
                ) : null}
                <p className="text-[11px] text-ink-muted">
                  <Link
                    href={docsHref}
                    className="font-medium text-brand hover:text-brand-dark"
                  >
                    Open {VAULT_NAV_LABEL}
                  </Link>{" "}
                  to see everything.
                </p>
              </div>
            </details>
          ) : null}

          {showPracticeStats && !(showMinimalWelcome && !emptyVault) ? (
            <details
              open
              className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5"
            >
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                {meta?.practiceStatsLine}
              </summary>
              <div className="mt-2 space-y-2 border-t border-stone-200 pt-2">
                {practiceStats ? (
                  <PracticeStatsChips
                    stats={practiceStats}
                    boardName={meta?.boardName}
                    disabled={sending || loadingHistory}
                    onAsk={(prompt) => void sendQuestion(prompt)}
                  />
                ) : null}
                {practiceStats && practiceStats.songTitles.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">
                      Songs
                    </p>
                    <NameList
                      names={practiceStats.songTitles}
                      more={Math.max(
                        0,
                        practiceStats.songCount - practiceStats.songTitles.length
                      )}
                    />
                  </div>
                ) : null}
                <p className="text-[11px] text-ink-muted">
                  Tap a count to open the list — or ask for chords anytime.
                </p>
              </div>
            </details>
          ) : null}

          {emptyVault ? (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {EMPTY_VAULT_HEADLINE}
                </p>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {EMPTY_VAULT_BODY}
                </p>
              </div>

              <EmptyAskGuidanceChips
                onTell={() => composerInputRef.current?.focus()}
                onUpload={openFilePicker}
                onAddToToday={openReminderForm}
                disabled={
                  vaultBusy || sending || !profileId || !canEditVault
                }
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openCamera}
                  className="inline-flex rounded-full border border-border-subtle bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
                >
                  Scan with camera
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={() => void runSampleDocument()}
                  className="inline-flex rounded-full border border-brand/40 bg-brand-light/50 px-3 py-2 text-xs font-semibold text-brand-dark transition hover:bg-brand-light disabled:opacity-50"
                >
                  Try with a sample
                </button>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-xs font-semibold text-foreground">
                  {TRY_GUARDIAN_TITLE}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {TRY_GUARDIAN_SUBTITLE}
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {exampleUploads.map((example) => (
                    <li
                      key={example}
                      className="text-xs leading-relaxed text-ink-muted"
                    >
                      • {example}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-ink-muted">
                No document required. Tell Gideon a date, promise, idea, or
                follow-up and Guardian can help you remember the next step.
              </p>

              <details className="rounded-xl border border-stone-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-foreground">
                  Privacy &amp; more ways to start
                </summary>
                <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {PRIVACY_CARD_TITLE}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {PRIVACY_CARD_POINTS.map((point) => (
                        <li
                          key={point}
                          className="text-xs leading-relaxed text-ink-muted"
                        >
                          • {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      {FIRST_MEMORY_PROMPT}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {FIRST_MEMORY_ACTIONS.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          disabled={
                            vaultBusy || sending || !profileId || !canEditVault
                          }
                          onClick={() => runFirstMemoryAction(action.id)}
                          className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-3 text-center transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                        >
                          <span className="text-xl" aria-hidden>
                            {action.emoji}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {action.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-foreground">
                      {ORGANIZE_INTRO}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ORGANIZE_EXAMPLES.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-ink-muted"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </>
          ) : showExpandedWelcome ? (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                {logsOnly
                  ? "Ask about Daily Logs, plan your day, or search Guardian when you need something from this space."
                  : "Ask anything — we can talk it through, plan your day, or search Guardian when you need your files."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openCamera}
                  className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  📷 Scan
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openFilePicker}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  📄 Add files or photos
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openLogForm}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  📝 Add Daily Log
                </button>
              </div>
            </>
          ) : null}

          {!showMinimalWelcome &&
          !emptyVault &&
          meta &&
          meta.suggestions.length > 0 ? (
            <div className="space-y-2 pt-0.5">
              <p className="text-xs font-semibold text-foreground">
                Try asking Gideon
              </p>
              <div className="flex flex-wrap gap-2">
                {meta.suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={sending || loadingHistory}
                    onClick={() => void sendQuestion(q)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showCreateSpaceShortcuts ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-3">
              <p className="text-xs font-semibold text-foreground">
                {hasOtherSpaces ? "Create another space" : "Create a space"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Keep every part of your life completely separate while using one
                Guardian account.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {VAULT_CREATE_CARDS.map((card) => (
                  <Link
                    key={card.id}
                    href={vaultCreateHref(card, "/ask")}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40"
                  >
                    <span className="shrink-0" aria-hidden>
                      {card.emoji}
                    </span>
                    {card.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>
      </div>
    </div>
    )
  );

  const askSidebar = (
    <AskGideonSidebar
      chats={chats}
      activeChatId={activeChatId}
      sending={sending}
      docsHref={docsHref}
      activeVaultName={active?.display_name ?? meta?.profileName}
      onNewChat={() => void startNewChat()}
      onSelectChat={(id) => void selectChat(id)}
      onDeleteChat={(id, e) => void deleteChat(id, e)}
      onImportChats={() => setImportOpen(true)}
      onSidebarAction={() => setSidebarOpen(false)}
      onToggleCollapsed={() => {
        setSidebarCollapsed((prev) => {
          const next = !prev;
          persistAskSidebarCollapsed(next);
          return next;
        });
      }}
    />
  );

  const messageList = (
    <div
      className={
        isPage || isDrawer
          ? "min-h-0 flex-1 scroll-pb-40 space-y-4 overflow-y-auto bg-background px-4 pb-40 pt-4 sm:px-8 md:scroll-pb-8 md:pb-8"
          : "max-h-64 space-y-3 overflow-y-auto rounded-xl bg-surface-elevated p-3 ring-1 ring-border-subtle"
      }
    >
      {loadingHistory ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <GideonAvatar size={40} variant="portrait" pulse />
          Gideon is checking your vault…
        </p>
      ) : (
        <>
          {firstWin ? (
            <FirstWinCard
              fileName={firstWin.fileName}
              summary={firstWin.summary}
              highlights={firstWin.highlights}
              onAskAnother={() => {
                setFirstWin(null);
              }}
              onAddOwn={() => {
                setFirstWin(null);
                openFilePicker();
              }}
              onDismiss={() => setFirstWin(null)}
            />
          ) : null}
          {welcomeBlock}
          {messages.map((m, index) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="flex max-w-[85%] flex-col items-end gap-2">
                  {messageAttachments(m).map((attachment) => (
                    <VaultAttachmentCard
                      key={attachment.documentId}
                      documentId={attachment.documentId}
                      fileName={attachment.fileName}
                      kind={attachment.kind}
                      previewUrl={attachment.previewUrl}
                    />
                  ))}
                  {m.content.trim() ? (
                    <div className="rounded-2xl bg-surface-elevated px-3.5 py-2 text-sm text-foreground">
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                {streamingAssistantId === m.id &&
                thinkingSteps.length > 0 &&
                !m.content.trim() ? null : (
                  <>
                <GideonAvatar size={40} variant="portrait" />
                {renderAssistantContent(m, {
                  hideCitationPreviews:
                    index > 0 &&
                    messages[index - 1]?.role === "user" &&
                    messageAttachments(messages[index - 1]!).length > 0 &&
                    (m.citations ?? []).some((c) =>
                      messageAttachments(messages[index - 1]!).some(
                        (attachment) => attachment.documentId === c.documentId
                      )
                    ),
                  userMessage:
                    index > 0 && messages[index - 1]?.role === "user"
                      ? messages[index - 1]
                      : undefined,
                  isStreaming: streamingAssistantId === m.id,
                  showSuggestedQuestions:
                    !streamingAssistantId &&
                    index ===
                      messages.reduce(
                        (last, msg, i) => (msg.role === "assistant" ? i : last),
                        -1
                      ),
                  showBinaryChoices:
                    !streamingAssistantId &&
                    index ===
                      messages.reduce(
                        (last, msg, i) => (msg.role === "assistant" ? i : last),
                        -1
                      ),
                })}
                  </>
                )}
              </div>
            )
          )}
          {pendingSmartUpload && profileId
            ? (() => {
                const presentation = buildSmartUploadPresentation(
                  pendingSmartUpload.result,
                  active?.display_name ?? meta?.profileName ?? "your space"
                );
                if (!presentation) return null;
                return (
                  <SmartUploadSuggestionCard
                    presentation={presentation}
                    onSaved={async ({ profilePath }) => {
                      void recordClientActionEvent({
                        actionId: "save_document",
                        label: "Saved document",
                        phase: "executed",
                        profileId,
                        message: profilePath ?? pendingSmartUpload.result.fileName,
                      });
                      const pending = pendingSmartUpload;
                      setPendingSmartUpload(null);
                      await loadMetaAndChats().catch(() => undefined);
                      if (profilePath) {
                        pushLocalNote(`Saved to ${profilePath}.`);
                      }
                      await continueUploadChat(pending);
                      void refreshOnboarding();
                    }}
                    onKeepHere={async () => {
                      const pending = pendingSmartUpload;
                      setPendingSmartUpload(null);
                      await continueUploadChat(pending);
                      void refreshOnboarding();
                    }}
                    onError={(message) => setError(message)}
                  />
                );
              })()
            : null}
          {(sending || vaultBusy || savingLog) && !streamingAssistantId && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <GideonAvatar size={40} variant="portrait" pulse />
              {savingLog
                ? "Saving to your space…"
                : vaultBusy && vaultStatus
                  ? vaultStatus
                  : loadingLabel}
            </div>
          )}
          {thinkingSteps.length > 0 &&
          streamingAssistantId &&
          !messages.find((m) => m.id === streamingAssistantId)?.content ? (
            <GideonThinkingPanel
              steps={thinkingSteps}
              activeIndex={thinkingActiveIndex}
            />
          ) : null}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );

  const workMemoryBanner = workProject ? (
    <div
      className={
        isPage
          ? "shrink-0 border-b border-brand/20 bg-brand-light/50 px-4 py-2.5 sm:px-8"
          : "mb-3 rounded-xl border border-brand/20 bg-brand-light/50 px-3 py-2.5"
      }
    >
      <p className="text-sm font-medium text-brand-dark">
        Resuming: {workProject.name}
      </p>
      {workProject.next_action ? (
        <p className="mt-0.5 text-xs text-ink-muted">
          Next action: {workProject.next_action}
        </p>
      ) : null}
      <Link
        href={`/work-memory/${workProject.id}`}
        className="mt-1 inline-block text-xs font-semibold text-brand hover:text-brand-dark"
      >
        Back to project →
      </Link>
    </div>
  ) : null;

  const workingInDisplay = effectiveProfile
    ? buildWorkingInDisplay({
        workspaceProfile: effectiveProfile,
        scopedProfile: scopedProfile ?? undefined,
        chatScopedProfile: meta?.chatScopedProfile ?? null,
        vaultScopeNote: meta?.vaultScopeNote ?? null,
      })
    : null;

  const handleSwitchWorkspace = useCallback(
    async (id: string) => {
      if (!id || id === effectiveProfile?.id) return;
      const ok = await switchProfile(id);
      if (!ok) return;
      if (isDrawer || scopedProfileId) {
        if (typeof window !== "undefined") {
          window.location.href = `/ask?profileId=${encodeURIComponent(id)}`;
        }
        return;
      }
      syncAskProfileUrl(id, { clearChat: true });
      setMeta((prev) =>
        prev
          ? {
              ...prev,
              chatScopedProfile: null,
              searchScope: DEFAULT_SEARCH_SCOPE,
            }
          : prev
      );
    },
    [effectiveProfile?.id, switchProfile, isDrawer, scopedProfileId, syncAskProfileUrl]
  );

  const workspaceContextBar =
    workingInDisplay && (scopeChromeOpen || !isPage) ? (
    <div
      className={
        isPage || isDrawer
          ? "shrink-0 border-b border-border-subtle px-2.5 py-1.5 sm:px-8 sm:py-2"
          : "mb-2 px-0.5"
      }
    >
      <div className={isPage ? "mx-auto max-w-3xl" : undefined}>
        <WorkspaceContextBar
          display={workingInDisplay}
          profiles={profiles}
          activeProfileId={effectiveProfile?.id ?? profileId ?? ""}
          onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
          onReturnToWorkspace={
            workingInDisplay.mode === "searching"
              ? () => void clearChatScopedProfile()
              : undefined
          }
          onOpenSearch={
            isPage ? () => setVaultSearchOpen(true) : undefined
          }
          searchScope={meta?.searchScope ?? DEFAULT_SEARCH_SCOPE}
          showSearchScopeToggle={
            profiles.length > 1 && workingInDisplay.mode !== "searching"
          }
          onSearchScopeChange={(scope) => void setChatSearchScope(scope)}
        />
      </div>
    </div>
  ) : null;

  const composer = (
    <form
      onSubmit={send}
      onPaste={handleComposerPaste}
      className={
        isPage || isDrawer
          ? `shrink-0 border-t border-border-subtle bg-background px-4 pt-3 sm:px-8 ${
              reserveSimpleNav ? "pb-simple-nav" : "pb-3"
            }`
          : "mt-3"
      }
    >
      <div className={isPage ? "mx-auto w-full max-w-3xl" : "w-full"}>
        <div className="relative rounded-2xl border border-border-subtle bg-surface shadow-sm focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/20">
          {pendingAttachment ? (
            <div className="px-3 pt-3">
              <div className="group relative inline-flex">
                <VaultAttachmentCard
                  documentId="local-pending"
                  fileName={pendingAttachment.file.name}
                  kind={pendingAttachment.kind}
                  previewUrl={pendingAttachment.previewUrl}
                />
                <button
                  type="button"
                  onClick={clearPendingAttachment}
                  disabled={sending || vaultBusy}
                  aria-label={`Remove ${pendingAttachment.file.name}`}
                  className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-ink-muted shadow-sm transition hover:bg-stone-50 hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="px-3 pt-2">
            <label className="sr-only" htmlFor={inputId}>
              Ask Gideon
            </label>
            <textarea
              id={inputId}
              ref={composerInputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={sending || vaultBusy || loadingHistory || voiceListening}
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              maxLength={2000}
              placeholder={
                voiceListening
                  ? "Listening…"
                  : pendingAttachment
                    ? "Write a message…"
                    : emptyVault
                      ? "Ask anything — plan your day, or use + to scan / upload…"
                      : logsOnly
                        ? "Ask about Daily Logs, plan your day, or search Guardian…"
                        : "Ask anything — plan your day, or search Guardian…"
              }
              className="block w-full resize-none border-0 bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-ink-muted disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div className="relative shrink-0" ref={plusRef}>
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                aria-expanded={plusOpen}
                aria-haspopup="menu"
                aria-label="Add to space"
                disabled={vaultBusy || sending || !profileId || !canEditVault}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
                  emptyVault
                    ? "border-brand/40 bg-brand-light text-brand hover:bg-brand/15"
                    : "border-stone-300 bg-white text-ink-muted hover:border-stone-400 hover:text-foreground"
                }`}
              >
                <Plus className="h-4 w-4" />
              </button>
              {plusOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId || !canEditVault}
                    onClick={openFilePicker}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1">Add files or photos</span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {attachShortcutLabel()}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId || !canEditVault}
                    onClick={openCamera}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4 text-brand" />
                    Scan with camera
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId || !canEditVault}
                    onClick={openLogForm}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <NotebookPen className="h-4 w-4 text-brand" />
                    Add daily log
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId || !canEditVault}
                    onClick={openReminderForm}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Bell className="h-4 w-4 text-brand" />
                    Add reminder
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId}
                    onClick={() => {
                      setPlusOpen(false);
                      setImportOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <FileUp className="h-4 w-4 text-brand" />
                    Import ChatGPT / Claude
                  </button>
                  <div className="my-1 border-t border-stone-100" role="separator" />
                  <Link
                    href="/settings/connections"
                    role="menuitem"
                    onClick={() => setPlusOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50"
                  >
                    <HardDrive className="h-4 w-4 text-brand" />
                    Connections
                  </Link>
                  <Link
                    href="/settings/profiles?add=1&return=%2Fask"
                    role="menuitem"
                    onClick={() => setPlusOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50"
                  >
                    <FolderOpen className="h-4 w-4 text-brand" />
                    New space
                  </Link>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <AgentModeToggle compact className="sm:hidden" />
              {voiceSupported ? (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={voiceListening ? "Stop listening" : "Talk to Gideon"}
                  aria-pressed={voiceListening}
                  disabled={sending || vaultBusy || !profileId}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
                    voiceListening
                      ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                      : "border-stone-300 bg-white text-ink-muted hover:border-stone-400 hover:text-foreground"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="submit"
                disabled={
                  sending ||
                  vaultBusy ||
                  loadingHistory ||
                  (!input.trim() && !pendingAttachment)
                }
                aria-label="Send question to Gideon"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                {sending || vaultBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={VAULT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) stageVaultFile(file);
          }}
        />
        <p className="mt-2 px-1 text-center text-[11px] leading-snug text-ink-muted">
          Gideon uses AI and can make mistakes. Verify important information.{" "}
          <Link
            href="/ai-disclaimer"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            AI Disclaimer
          </Link>
        </p>
      </div>
    </form>
  );

  const vaultOverlays = (
    <>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => stageVaultFile(file)}
      />
      {logOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-log-title"
        >
          <form
            onSubmit={(e) => void saveInlineLog(e)}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="ask-log-title" className="text-base font-semibold">
                  Add a Daily Log
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Saved to{" "}
                  {active?.display_name ?? meta?.profileName ?? "this space"}{" "}
                  — stays on Ask Gideon.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  pendingDailyLogMessageIdRef.current = null;
                  setLogOpen(false);
                }}
                aria-label="Close"
                className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label
              htmlFor="ask-log-entry-title"
              className="mt-4 block text-sm font-medium"
            >
              Title <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="ask-log-entry-title"
              type="text"
              maxLength={200}
              value={logTitle}
              onChange={(e) => setLogTitle(e.target.value)}
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              placeholder="School pickup"
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
            />
            <label className="sr-only" htmlFor="ask-log-content">
              What happened
            </label>
            <textarea
              id="ask-log-content"
              value={logContent}
              onChange={(e) => setLogContent(e.target.value)}
              rows={4}
              required
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              maxLength={8000}
              placeholder="What happened today?"
              className="mt-3 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  pendingDailyLogMessageIdRef.current = null;
                  setLogOpen(false);
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingLog || !logContent.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {savingLog ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save log
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {reminderOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-reminder-title"
        >
          <form
            onSubmit={(e) => void saveInlineReminder(e)}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="ask-reminder-title" className="text-base font-semibold">
                  Add a reminder
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Saved for{" "}
                  {profileNameForId(reminderSaveProfileId) ??
                    active?.display_name ??
                    meta?.profileName ??
                    "this space"}{" "}
                  ({timeZoneLabel}). Shows under Attention on the dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReminderOpen(false);
                  setReminderTargetProfileId(null);
                }}
                aria-label="Close"
                className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label
              htmlFor="ask-reminder-what"
              className="mt-4 block text-sm font-medium"
            >
              What
            </label>
            <input
              id="ask-reminder-what"
              type="text"
              required
              maxLength={200}
              value={reminderTitle}
              onChange={(e) => setReminderTitle(e.target.value)}
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              placeholder="Bible study"
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ask-reminder-date"
                  className="block text-sm font-medium"
                >
                  Date
                </label>
                <input
                  id="ask-reminder-date"
                  type="date"
                  required
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                />
              </div>
              <div>
                <label
                  htmlFor="ask-reminder-time"
                  className="block text-sm font-medium"
                >
                  Time
                </label>
                <input
                  id="ask-reminder-time"
                  type="time"
                  required
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReminderOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingReminder || !reminderTitle.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {savingReminder ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save reminder
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <VaultChatImportModal
        open={importOpen}
        profileId={vaultProfileId ?? profileId}
        onClose={() => setImportOpen(false)}
        onImported={(result) => void handleImportComplete(result)}
      />
    </>
  );

  if (needsSetup) {
    const setupBlock = profilesLoading ? (
      <div className="mx-auto max-w-md space-y-4 px-1 py-8 text-center">
        <div className="flex justify-center">
          <GideonAvatar size={44} pulse />
        </div>
        <p className="text-sm text-ink-muted">Setting up your personal space…</p>
      </div>
    ) : (
      <div className="mx-auto max-w-xl px-1 py-6">
        <ProfileSetupHub />
      </div>
    );
    if (!isPage) {
      return (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          {setupBlock}
        </div>
      );
    }
    return (
      <div
        className="gideon-chat flex h-full w-full items-center justify-center bg-background px-4 text-foreground"
        data-gideon-theme={gideonChatTheme}
      >
        {setupBlock}
      </div>
    );
  }

  if (isDrawer) {
    return (
      <div
        className="gideon-chat flex h-full min-h-0 flex-col bg-background text-foreground"
        data-gideon-theme={gideonChatTheme}
      >
        {messageList}
        {error && (
          <PlanLimitAlert
            message={error.message}
            code={error.code}
            className="shrink-0 px-3 text-xs text-red-700"
          />
        )}
        <ImminentReminderBanner profileId={profileId} />
        {workspaceContextBar}
        {composer}
        {vaultOverlays}
      </div>
    );
  }

  if (!isPage) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GideonAvatar size={28} />
            <div>
              <h2 className="text-base font-semibold">Ask Gideon</h2>
              <p className="text-[11px] text-ink-muted">
                {GIDEON_CHIEF_OF_STAFF_TAGLINE}
              </p>
            </div>
          </div>
          <Link
            href="/ask"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark"
          >
            Open full screen
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        {messageList}
        {error && (
          <PlanLimitAlert
            message={error.message}
            code={error.code}
            className="mt-2 text-xs text-red-700"
          />
        )}
        <ImminentReminderBanner profileId={profileId} />
        {workMemoryBanner}
        {workspaceContextBar}
        {composer}
        {vaultOverlays}
      </div>
    );
  }

  return (
    <>
    <div
      className="gideon-chat flex h-full w-full overflow-hidden bg-background text-foreground"
      data-gideon-theme={gideonChatTheme}
    >
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-border-subtle bg-surface-elevated transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-14" : "w-64"
        }`}
      >
        {sidebarCollapsed ? (
          <div className="flex h-full flex-col items-center gap-1 py-3">
            <button
              type="button"
              onClick={() => {
                setSidebarCollapsed(false);
                persistAskSidebarCollapsed(false);
              }}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="rounded-full p-2 text-ink-muted transition hover:bg-white hover:text-foreground"
            >
              <PanelRightOpen className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={sending}
              aria-label="New chat"
              title="New chat"
              className="rounded-full p-2 text-brand transition hover:bg-white disabled:opacity-50"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
            <Link
              href={docsHref}
              aria-label="Docs"
              title="Docs"
              className="rounded-full p-2 text-ink-muted transition hover:bg-white hover:text-foreground"
            >
              <FileText className="h-5 w-5" />
            </Link>
          </div>
        ) : (
          askSidebar
        )}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-stone-900/40"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-surface-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
              <span className="text-sm font-semibold">Spaces &amp; chats</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-ink-muted hover:bg-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{askSidebar}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle bg-background px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-elevated md:hidden"
            aria-label="Open spaces and chats"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          {sidebarCollapsed ? (
            <button
              type="button"
              className="hidden rounded-full p-2 text-ink-muted hover:bg-surface-elevated md:inline-flex"
              aria-label="Show chats"
              title="Show chats"
              onClick={() => {
                setSidebarCollapsed(false);
                persistAskSidebarCollapsed(false);
              }}
            >
              <PanelRightOpen className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              className="hidden rounded-full p-2 text-ink-muted hover:bg-surface-elevated md:inline-flex"
              aria-label="Hide chats"
              title="Hide chats"
              onClick={() => {
                setSidebarCollapsed(true);
                persistAskSidebarCollapsed(true);
              }}
            >
              <PanelRightOpen className="h-5 w-5 rotate-180" />
            </button>
          )}
          <span className="hidden sm:inline-flex">
            <GideonAvatar size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <AskTitleProfileSwitch
              title={
                chats.find((c) => c.id === activeChatId)?.title ?? "Ask Gideon"
              }
            />
          </div>
          {workingInDisplay ? (
            <button
              type="button"
              onClick={() => setScopeChromeOpen((o) => !o)}
              aria-pressed={scopeChromeOpen}
              title={
                (meta?.searchScope ?? DEFAULT_SEARCH_SCOPE) === "global"
                  ? `Asking across all spaces. Files save to ${workingInDisplay.primaryName}. Tap to change.`
                  : `Answers from ${workingInDisplay.primaryName} only. Tap to change scope.`
              }
              className={`inline-flex max-w-[9rem] items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition sm:max-w-[12rem] ${
                scopeChromeOpen
                  ? "border-brand bg-brand-light/40 text-brand-dark"
                  : "border-border-subtle bg-surface text-ink-muted hover:text-foreground"
              }`}
            >
              {/* Answer scope only — never the file-home name while All is on. */}
              {(meta?.searchScope ?? DEFAULT_SEARCH_SCOPE) === "global" ? (
                "All spaces"
              ) : (
                <>
                  <Lock className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{workingInDisplay.primaryName}</span>
                </>
              )}
            </button>
          ) : null}
          <div className="flex shrink-0 items-center gap-1">
            {reserveSimpleNav ? (
              <Link
                href={SIMPLE_HOME_PATH}
                aria-label="Back to Today"
                title="Today"
                className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-elevated sm:inline-flex"
              >
                <GuardianIcon size={16} alt="" />
                <span>Today</span>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={sending}
              aria-label="New chat"
              title="New chat"
              className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface p-2 text-xs font-semibold transition hover:bg-surface-elevated disabled:opacity-50"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <div className="relative" ref={headerMoreRef}>
              <button
                type="button"
                onClick={() => setHeaderMoreOpen((o) => !o)}
                aria-expanded={headerMoreOpen}
                aria-label="More"
                className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface p-2 text-ink-muted transition hover:bg-surface-elevated hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {headerMoreOpen ? (
                <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-border-subtle bg-surface py-1 shadow-lg">
                  <Link
                    href={SIMPLE_HOME_PATH}
                    onClick={() => setHeaderMoreOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-elevated"
                  >
                    {simpleHomeEnabled ? (
                      <GuardianIcon size={16} alt="" />
                    ) : (
                      <Home className="h-4 w-4 text-ink-muted" />
                    )}
                    {simpleHomeEnabled ? "Today" : "Home"}
                  </Link>
                  <Link
                    href={INBOX_PATH}
                    onClick={() => setHeaderMoreOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-elevated"
                  >
                    <Inbox className="h-4 w-4 text-ink-muted" />
                    Inbox
                  </Link>
                  <Link
                    href={VAULTS_PATH}
                    onClick={() => setHeaderMoreOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-elevated"
                  >
                    <FileText className="h-4 w-4 text-ink-muted" />
                    {VAULT_NAV_LABEL}
                  </Link>
                  <Link
                    href="/settings/connections"
                    onClick={() => setHeaderMoreOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-elevated"
                  >
                    <FolderOpen className="h-4 w-4 text-ink-muted" />
                    Connections
                  </Link>
                  <div className="border-t border-border-subtle px-2 py-1.5">
                    <GideonChatThemeToggle className="w-full justify-start gap-2 rounded-lg border-0 px-2 py-2" />
                  </div>
                  <div className="px-1 pb-1">
                    <AgentModeToggle
                      compact
                      className="w-full justify-start"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMoreOpen(false);
                      setWhyOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-elevated"
                  >
                    <Info className="h-4 w-4 text-ink-muted" />
                    About Gideon
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {focusBlock ? (
          <GideonFocusCountdown
            block={focusBlock}
            timeZone={timeZone}
            onStop={() => {
              dismissedFocusEndsAtRef.current = focusBlock.endsAt;
              setFocusBlock(null);
            }}
          />
        ) : null}

        {whyOpen && (
          <div className="shrink-0 border-b border-border-subtle bg-surface-elevated px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-8">
            <p className="whitespace-pre-wrap">{GIDEON_WHY}</p>
            <p className="mt-2 font-medium text-foreground">{GIDEON_BRAND_LINE}</p>
          </div>
        )}

        {workspaceContextBar}

        {messageList}

        {error && (
          <PlanLimitAlert
            message={error.message}
            code={error.code}
            className="shrink-0 px-4 text-xs text-red-700 sm:px-8"
          />
        )}

        <ImminentReminderBanner profileId={profileId} />
        {workMemoryBanner}
        {composer}
      </div>
    </div>
    <GlobalVaultSearch
      open={vaultSearchOpen}
      onClose={() => setVaultSearchOpen(false)}
    />
    {vaultOverlays}
    {sideVault ? (
      <VaultChatDrawer
        profileId={sideVault.profileId}
        profileName={sideVault.profileName}
        onClose={() => setSideVault(null)}
      />
    ) : null}
    {reserveSimpleNav ? (
      <Suspense fallback={null}>
        <SimpleNavigation />
      </Suspense>
    ) : null}
    </>
  );
}
