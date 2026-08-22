"use client";

import {
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
import { useSearchParams } from "next/navigation";
import PlanLimitAlert from "@/components/PlanLimitAlert";
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
import { renderGideonText } from "@/components/gideonText";
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
import type { SearchScopeMode } from "@/lib/workspace-context/client";
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
import { useAgentMode } from "@/hooks/useAgentMode";
import {
  formatAssistantMessagePlainText,
  formatAssistantMessageSpeechText,
} from "@/lib/vault/assistantMessageText";
import { documentsHref, VAULT_NAV_LABEL } from "@/lib/routes";
import { practiceStatsListPrompt } from "@/lib/vault/askInventory";
import type { WorkProject } from "@/lib/work-memory/types";
import OnboardingProgressChip from "@/components/OnboardingProgressChip";
import FirstWinCard from "@/components/FirstWinCard";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useSimpleHomeEnabled } from "@/hooks/useSimpleHomeEnabled";
import {
  autoQuestionForUpload,
  uploadCtaForProfileKind,
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
  return resolveVaultFileMimeType(file).startsWith("image/");
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

const SECTION_STYLES: Record<string, string> = {
  from_documents: "border-brand/30 bg-brand-light/40",
  from_daily_log: "border-emerald-200 bg-emerald-50/80",
  from_profiles: "border-teal-200 bg-teal-50/80",
  from_work_memory: "border-indigo-200 bg-indigo-50/70",
  from_ontology: "border-cyan-200 bg-cyan-50/70",
  calculated: "border-sky-200 bg-sky-50/80",
  general_knowledge: "border-stone-200 bg-stone-50/90",
  suggestion: "border-violet-200 bg-violet-50/70",
  needs_verification: "border-amber-200 bg-amber-50/80",
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
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ASK_SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
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
  const { active, profiles, loading: profilesLoading, switchProfile, refresh, timeZone, timeZoneLabel } =
    useActiveProfile();
  const { progress: onboardingProgress, refresh: refreshOnboarding } =
    useOnboardingProgress();
  const { enabled: simpleHomeEnabled } = useSimpleHomeEnabled();
  const needsSetup = !profilesLoading && profiles.length === 0;
  const reserveSimpleNav =
    isPage &&
    simpleHomeEnabled &&
    !needsSetup &&
    active?.profile_type !== "employee";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [gideonWelcomeSeen, setGideonWelcomeSeen] = useState(readGideonWelcomeSeen);
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentRef = useRef<PendingVaultAttachment | null>(null);
  const profileSwitchRef = useRef(false);
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
  const sendQuestionRef = useRef<(questionRaw: string) => Promise<void>>(
    async () => {}
  );
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
    void sendQuestionRef.current(draft);
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
      if (!profileId || vaultBusy || sending || !canEditVault) return;
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
    [profileId, vaultBusy, sending, canEditVault, revokePendingPreview]
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
    // Read the live URL, not useSearchParams. history.replaceState can clear
    // profileId before Next.js catches up — the stale param would snap back.
    const liveProfileId = readUrlProfileId();
    if (!liveProfileId) return;
    if (active?.id === liveProfileId) return;
    if (!profiles.some((p) => p.id === liveProfileId)) return;
    profileSwitchRef.current = true;
    void switchProfile(liveProfileId).finally(() => {
      profileSwitchRef.current = false;
    });
  }, [
    requestedProfileId,
    active?.id,
    profilesLoading,
    needsSetup,
    profiles,
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
    const onProfile = () => {
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
  }, [needsSetup, scopedProfileId]);

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
    const { data, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60);
    if (signedError || !data?.signedUrl) {
      setError("I couldn't open that source document.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    void fileName;
  };

  const pushLocalNote = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `note-${Date.now()}`,
        role: "assistant",
        content,
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const uploadVaultFile = async (file: File) => {
    if (!profileId) {
      throw new Error("Choose a space before uploading.");
    }
    setError(null);
    setVaultBusy(true);
    setVaultStatus("Uploading to your space…");

    try {
      const supabase = createClient();
      if (!supabase) {
        throw new Error("Sign-in isn't available. Refresh and try again.");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in.");

      const result = await uploadAndAnalyzeToVault({
        userId: user.id,
        profileId,
        ownerUserId: active?.owner_user_id,
        file,
        onStatus: setVaultStatus,
      });

      await loadMetaAndChats().catch(() => undefined);
      return result;
    } finally {
      setVaultBusy(false);
      setVaultStatus(null);
    }
  };

  const continueUploadChat = async (args: {
    result: VaultUploadResult;
    file: File;
    attachmentPreview?: string | null;
    userMsgId?: string;
    question?: string;
    userDisplayContent?: string;
  }) => {
    const finalQuestion =
      args.question?.trim() ||
      autoQuestionForUpload({
        kind: active?.profile_type,
        fileName: args.result.fileName,
        isImage: isImageUpload(args.file),
      });
    await sendQuestion(finalQuestion, {
      attachment: {
        documentId: args.result.documentId,
        fileName: args.result.fileName,
        kind: isImageUpload(args.file) ? "image" : "document",
        previewUrl: args.attachmentPreview ?? null,
      },
      userDisplayContent: args.userDisplayContent,
      replaceUserMessageId: args.userMsgId,
    });
  };

  const handleAnalyzedUpload = async (args: {
    result: VaultUploadResult;
    file: File;
    attachmentPreview?: string | null;
    userMsgId?: string;
    question?: string;
    userDisplayContent?: string;
    wasEmpty: boolean;
  }) => {
    void recordClientActionEvent({
      actionId: "upload_document",
      label: "Uploaded document",
      phase: "executed",
      profileId,
      message: args.result.fileName,
    });

    maybeShowFirstWin({
      wasEmpty: args.wasEmpty,
      fileName: args.result.fileName,
      summary: args.result.summary,
      facts: args.result.facts,
    });

    if (
      args.result.organizationAutoApplied &&
      args.result.organizationSuggestion?.profilePath
    ) {
      pushLocalNote(
        `Guardian filed "${args.result.fileName}" in ${args.result.organizationSuggestion.profilePath}.`
      );
    }

    if (
      profileId &&
      active?.profile_type !== "event" &&
      shouldPromptSmartUpload(args.result, profileId)
    ) {
      setPendingSmartUpload(args);
      return;
    }

    await continueUploadChat(args);
    void refreshOnboarding();
  };

  const maybeShowFirstWin = (args: {
    wasEmpty: boolean;
    fileName: string;
    summary?: string | null;
    facts?: FirstWinFactInput[] | null;
  }) => {
    if (!args.wasEmpty || readFirstWinSeen()) return;
    const highlights = pickFirstWinHighlights(args.facts ?? [], 3);
    writeFirstWinSeen(true);
    trackOnboardingEvent("first_document_uploaded", {
      profileKind: active?.profile_type ?? null,
      source: args.fileName.toLowerCase().includes("sample")
        ? "sample"
        : "upload",
    });
    trackOnboardingEvent("first_win_shown", {
      profileKind: active?.profile_type ?? null,
    });
    setFirstWin({
      fileName: args.fileName,
      summary: args.summary ?? null,
      highlights,
    });
  };

  const runSampleDocument = async () => {
    if (!profileId || !canEditVault || vaultBusy || sending) return;
    trackOnboardingEvent("sample_started", {
      profileKind: active?.profile_type ?? null,
    });
    const wasEmpty =
      !onboardingProgress.hasDocument &&
      (meta?.documentCount ?? 0) + (meta?.photoCount ?? 0) === 0;
    const file = buildSampleDocumentFile(active?.profile_type);
    setInput("");
    clearPendingAttachment();

    const userMsgId = `local-sample-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: "Try this sample document",
        attachment: {
          documentId: userMsgId,
          fileName: file.name,
          kind: "document",
          previewUrl: null,
        },
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const result = await uploadVaultFile(file);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsgId && m.attachment
            ? {
                ...m,
                attachment: {
                  ...m.attachment,
                  documentId: result.documentId,
                  fileName: result.fileName,
                },
              }
            : m
        )
      );

      if (!result.analyzed) {
        pushLocalNote(
          `I added "${result.fileName}" to your space, but analysis didn't finish${
            result.analysisError ? `: ${result.analysisError}` : "."
          }`
        );
        void refreshOnboarding();
        return;
      }

      await handleAnalyzedUpload({
        result,
        file,
        attachmentPreview: null,
        userMsgId,
        userDisplayContent: "Try this sample document",
        wasEmpty,
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
      setError(
        err instanceof Error ? err.message : "Sample upload failed. Please try again."
      );
    }
  };

  const openCamera = () => {
    setPlusOpen(false);
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    ) {
      setCameraOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const openFilePicker = () => {
    setPlusOpen(false);
    fileInputRef.current?.click();
  };

  const openLogForm = () => {
    setPlusOpen(false);
    pendingDailyLogMessageIdRef.current = null;
    setLogTitle("");
    setLogContent("");
    setLogOpen(true);
  };

  const openReminderForm = () => {
    setPlusOpen(false);
    const defaults = defaultReminderDateTime(timeZone);
    setReminderTitle("");
    setReminderDate(defaults.date);
    setReminderTime(defaults.time);
    setReminderTargetProfileId(null);
    setReminderOpen(true);
  };

  const dismissVaultScope = async (messageId: string) => {
    setDismissedVaultScopeIds((prev) => new Set(prev).add(messageId));
    if (!activeChatId) return;
    try {
      await fetch("/api/documents/vault-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withVaultChatProfileId(
            {
              chatId: activeChatId,
              clearScopedProfile: true,
            },
            vaultProfileId
          )
        ),
      });
      setMeta((prev) =>
        prev ? { ...prev, chatScopedProfile: null } : prev
      );
    } catch {
      /* non-blocking */
    }
  };

  const setChatSearchScope = async (scope: SearchScopeMode) => {
    setMeta((prev) =>
      prev
        ? {
            ...prev,
            searchScope: scope,
          }
        : prev
    );
    if (!activeChatId) return;
    try {
      const res = await fetch("/api/documents/vault-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withVaultChatProfileId(
            {
              chatId: activeChatId,
              setSearchScope: scope,
            },
            vaultProfileId
          )
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        searchScope?: SearchScopeMode;
        vaultScopeNote?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update search scope.");
        return;
      }
      setMeta((prev) =>
        prev
          ? {
              ...prev,
              searchScope: body.searchScope ?? scope,
              vaultScopeNote: body.vaultScopeNote ?? prev.vaultScopeNote,
            }
          : prev
      );
    } catch {
      setError("Couldn't update search scope. Try again.");
    }
  };

  const clearChatScopedProfile = async () => {
    if (!activeChatId) {
      setMeta((prev) =>
        prev ? { ...prev, chatScopedProfile: null } : prev
      );
      return;
    }
    try {
      await fetch("/api/documents/vault-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withVaultChatProfileId(
            {
              chatId: activeChatId,
              clearScopedProfile: true,
            },
            vaultProfileId
          )
        ),
      });
      setMeta((prev) =>
        prev ? { ...prev, chatScopedProfile: null } : prev
      );
      void loadThread(activeChatId, { refresh: true, silent: true });
    } catch {
      setError("Couldn't return to your workspace. Try again.");
    }
  };

  const openSideVault = (profileId: string, profileName: string, messageId: string) => {
    setSideVault({ profileId, profileName });
    setDismissedVaultScopeIds((prev) => new Set(prev).add(messageId));
  };

  const continueInScopedVault = async (
    profileId: string,
    profileName: string,
    messageId: string
  ) => {
    if (!activeChatId) return;
    setSwitchingVaultScopeId(messageId);
    try {
      const res = await fetch("/api/documents/vault-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withVaultChatProfileId(
            {
              chatId: activeChatId,
              setScopedProfile: profileId,
            },
            vaultProfileId
          )
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        chatScopedProfile?: Meta["chatScopedProfile"];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update chat scope.");
        return;
      }
      setDismissedVaultScopeIds((prev) => new Set(prev).add(messageId));
      setMeta((prev) =>
        prev
          ? {
              ...prev,
              chatScopedProfile:
                body.chatScopedProfile ??
                (profileId !== (effectiveProfile?.id ?? profileId)
                  ? { profileId, profileName }
                  : null),
            }
          : prev
      );
      void loadThread(activeChatId, { refresh: true, silent: true });
    } catch {
      setError("Couldn't update chat scope. Check your connection and try again.");
    } finally {
      setSwitchingVaultScopeId(null);
    }
  };

  const saveInlineReminder = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !reminderSaveProfileId ||
      !reminderTitle.trim() ||
      savingReminder ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    setSavingReminder(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: reminderSaveProfileId,
          title: reminderTitle.trim(),
          date: reminderDate,
          time: reminderTime,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        whenLabel?: string;
        reminder?: { title: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save reminder.");
        return;
      }
      const title = body.reminder?.title ?? reminderTitle.trim();
      const when = body.whenLabel ?? `${reminderDate} ${reminderTime}`;
      setReminderOpen(false);
      setReminderTitle("");
      setReminderTargetProfileId(null);
      window.dispatchEvent(new Event("guardian:alerts-updated"));
      pushLocalNote(
        `Reminder set: "${title}" — ${when}. You'll see it under Attention on the dashboard.`
      );
    } catch {
      setError("Couldn't save reminder. Check your connection and try again.");
    } finally {
      setSavingReminder(false);
    }
  };

  const confirmProposedReminder = async (
    messageId: string,
    proposal: ProposedReminder,
    targetProfileId?: string | null
  ) => {
    const saveProfileId = targetProfileId ?? profileId;
    if (!saveProfileId || confirmingReminderId || savingReminder || vaultBusy || sending) {
      return;
    }
    setConfirmingReminderId(messageId);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: saveProfileId,
          title: proposal.title,
          date: proposal.date,
          time: proposal.time,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        whenLabel?: string;
        reminder?: { title: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save reminder.");
        return;
      }
      setConfirmedReminderIds((prev) => new Set(prev).add(messageId));
      window.dispatchEvent(new Event("guardian:alerts-updated"));
      const title = body.reminder?.title ?? proposal.title;
      const when =
        body.whenLabel ?? proposedReminderWhenLabel(proposal, timeZone);
      pushLocalNote(
        `Reminder set: "${title}" — ${when}. You'll see it under Attention on the dashboard.`
      );
    } catch {
      setError("Couldn't save reminder. Check your connection and try again.");
    } finally {
      setConfirmingReminderId(null);
    }
  };

  const confirmProposedDailyLog = async (
    messageId: string,
    proposal: ProposedDailyLog,
    targetProfileId?: string | null
  ) => {
    const saveProfileId = targetProfileId ?? profileId;
    if (
      !saveProfileId ||
      confirmingDailyLogId ||
      savingLog ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    setConfirmingDailyLogId(messageId);
    setError(null);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: saveProfileId,
          content: proposal.content,
          title: proposal.title?.trim() || undefined,
          quick: true,
          logDate: proposal.logDate,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save Daily Log.");
        return;
      }
      markDailyLogConfirmed(messageId);
      window.dispatchEvent(new Event("guardian:logs-updated"));
      pushLocalNote(
        `Daily Log saved: ${proposedDailyLogSummary(proposal, timeZone)}`
      );
    } catch {
      setError("Couldn't save Daily Log. Check your connection and try again.");
    } finally {
      setConfirmingDailyLogId(null);
    }
  };

  const confirmProposedWorkMemoryUpdate = async (
    messageId: string,
    proposal: ProposedWorkMemoryUpdate
  ) => {
    if (
      confirmingWorkMemoryId ||
      savingWorkMemory ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    setConfirmingWorkMemoryId(messageId);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      if (proposal.status) patch.status = proposal.status;
      if (proposal.mission) patch.mission = proposal.mission;
      if (proposal.currentStep) patch.currentStep = proposal.currentStep;
      if (proposal.nextAction) patch.nextAction = proposal.nextAction;
      if (proposal.blockers) patch.blockers = proposal.blockers;

      const res = await fetch(
        `/api/work-memory/projects/${encodeURIComponent(proposal.projectId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: { id: string; name: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update Work Memory.");
        return;
      }
      setConfirmedWorkMemoryIds((prev) => new Set(prev).add(messageId));
      if (body.project && workProject?.id === body.project.id) {
        setWorkProject(body.project as WorkProject);
      }
      const label =
        proposedWorkMemoryUpdateSummary(
          proposal,
          body.project?.name ?? workProject?.name
        ) || body.project?.name || "project";
      pushLocalNote(`Work Memory updated: ${label}.`);
    } catch {
      setError("Couldn't update Work Memory. Check your connection and try again.");
    } finally {
      setConfirmingWorkMemoryId(null);
    }
  };

  const confirmProposedClientRequestReply = async (
    messageId: string,
    proposal: ProposedClientRequestReply,
    requestTitle?: string | null
  ) => {
    if (
      confirmingClientRequestId ||
      savingClientRequestReply ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    setConfirmingClientRequestId(messageId);
    setError(null);
    try {
      const commentRes = await fetch(
        `/api/client-requests/${encodeURIComponent(proposal.requestId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: proposal.content }),
        }
      );
      const commentBody = (await commentRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!commentRes.ok) {
        setError(commentBody.error ?? "Couldn't post reply on request.");
        return;
      }

      if (proposal.status) {
        const statusRes = await fetch(
          `/api/client-requests/${encodeURIComponent(proposal.requestId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: proposal.status }),
          }
        );
        const statusBody = (await statusRes.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!statusRes.ok) {
          setError(
            statusBody.error ?? "Reply posted but status couldn't be updated."
          );
          return;
        }
      }

      setConfirmedClientRequestIds((prev) => new Set(prev).add(messageId));
      pushLocalNote(
        `Reply posted on client request: ${proposedClientRequestReplySummary(
          proposal,
          requestTitle
        )}`
      );
    } catch {
      setError(
        "Couldn't post reply. Check your connection and try again."
      );
    } finally {
      setConfirmingClientRequestId(null);
    }
  };

  const resolveAssigneeUserId = async (
    clientProfileId: string,
    assigneeName: string
  ): Promise<string | null> => {
    const clientProfile = profiles.find((p) => p.id === clientProfileId);
    const businessId = clientProfile?.parent_profile_id;
    if (!businessId) return null;
    const res = await fetch(
      `/api/client-requests/assignees?profileId=${encodeURIComponent(businessId)}`
    );
    const body = (await res.json().catch(() => ({}))) as {
      assignees?: { userId: string; name: string }[];
    };
    if (!res.ok) return null;
    const needle = assigneeName.trim().toLowerCase();
    const hit = (body.assignees ?? []).find((a) =>
      a.name.trim().toLowerCase().includes(needle)
    );
    return hit?.userId ?? null;
  };

  const confirmProposedClientRequestCreate = async (
    messageId: string,
    proposal: ProposedClientRequestCreate
  ) => {
    if (
      confirmingClientRequestCreateId ||
      savingClientRequestCreate ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    setConfirmingClientRequestCreateId(messageId);
    setError(null);
    try {
      const createRes = await fetch("/api/client-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: proposal.profileId,
          title: proposal.title,
          description: proposal.description,
        }),
      });
      const createBody = (await createRes.json().catch(() => ({}))) as {
        error?: string;
        request?: { id: string };
      };
      if (!createRes.ok || !createBody.request?.id) {
        setError(createBody.error ?? "Couldn't create client request.");
        return;
      }
      const requestId = createBody.request.id;

      const threadMessage =
        proposal.initialMessage?.trim() || proposal.description.trim();
      if (threadMessage) {
        const commentRes = await fetch(
          `/api/client-requests/${encodeURIComponent(requestId)}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: threadMessage }),
          }
        );
        const commentBody = (await commentRes.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!commentRes.ok) {
          setError(
            commentBody.error ??
              "Request created but the first message couldn't be posted."
          );
          return;
        }
      }

      if (proposal.assignedToName) {
        const assigneeUserId = await resolveAssigneeUserId(
          proposal.profileId,
          proposal.assignedToName
        );
        if (!assigneeUserId) {
          setError(
            `Request created, but couldn't find employee "${proposal.assignedToName}" to assign. Assign them from Requests.`
          );
          setConfirmedClientRequestCreateIds((prev) => new Set(prev).add(messageId));
          setCreatedClientRequestIds((prev) =>
            new Map(prev).set(messageId, requestId)
          );
          pushLocalNote(
            `Client request created: ${proposedClientRequestCreateSummary(
              proposal,
              profiles.find((p) => p.id === proposal.profileId)?.display_name
            )}`
          );
          return;
        }
        const assignRes = await fetch(
          `/api/client-requests/${encodeURIComponent(requestId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignedToUserId: assigneeUserId }),
          }
        );
        const assignBody = (await assignRes.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!assignRes.ok) {
          setError(
            assignBody.error ??
              "Request created but assignee couldn't be updated."
          );
          return;
        }
      }

      setConfirmedClientRequestCreateIds((prev) => new Set(prev).add(messageId));
      setCreatedClientRequestIds((prev) =>
        new Map(prev).set(messageId, requestId)
      );
      pushLocalNote(
        `Client request created: ${proposedClientRequestCreateSummary(
          proposal,
          profiles.find((p) => p.id === proposal.profileId)?.display_name
        )}`
      );
    } catch {
      setError("Couldn't create request. Check your connection and try again.");
    } finally {
      setConfirmingClientRequestCreateId(null);
    }
  };

  const confirmProposedSpaceCreate = async (
    messageId: string,
    proposal: ProposedSpaceCreate,
    parentProfileId: string | null
  ) => {
    if (
      confirmingSpaceCreateId ||
      savingSpaceCreate ||
      vaultBusy ||
      sending
    ) {
      return;
    }
    if (
      profileTypeRequiresParent(proposal.profileType) &&
      !parentProfileId
    ) {
      setError("Choose a parent space for this type.");
      return;
    }
    setConfirmingSpaceCreateId(messageId);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: proposal.optionId,
          profileType: proposal.profileType,
          displayName: proposal.displayName,
          parentProfileId: parentProfileId ?? undefined,
          switchTo: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: { id?: string };
      };
      if (!res.ok || !body.profile?.id) {
        setError(body.error ?? "Couldn't create space.");
        return;
      }
      dispatchAwardsFromResponse(body);
      await refresh();
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
      setConfirmedSpaceCreateIds((prev) => new Set(prev).add(messageId));
      setCreatedSpaceProfileIds((prev) =>
        new Map(prev).set(messageId, body.profile!.id!)
      );
      const parentName = parentProfileId
        ? profiles.find((p) => p.id === parentProfileId)?.display_name
        : null;
      pushLocalNote(
        `Space created: ${proposedSpaceCreateSummary(proposal, parentName)}`
      );
    } catch {
      setError("Couldn't create space. Check your connection and try again.");
    } finally {
      setConfirmingSpaceCreateId(null);
    }
  };

  const saveInlineLog = async (e: FormEvent) => {
    e.preventDefault();
    const saveProfileId = profileId ?? lastWriteProfileIdRef.current;
    if (!saveProfileId || !logContent.trim() || savingLog || vaultBusy || sending) {
      return;
    }
    setSavingLog(true);
    setError(null);
    const title = logTitle.trim().slice(0, 200);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: saveProfileId,
          content: logContent.trim(),
          title: title || undefined,
          quick: true,
          logDate: todayLogDate(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save Daily Log.");
        return;
      }
      const saved = logContent.trim();
      const proposalMessageId = pendingDailyLogMessageIdRef.current;
      pendingDailyLogMessageIdRef.current = null;
      setLogOpen(false);
      setLogTitle("");
      setLogContent("");
      window.dispatchEvent(new Event("guardian:logs-updated"));
      if (proposalMessageId) {
        markDailyLogConfirmed(proposalMessageId);
        pushLocalNote(
          `Daily Log saved${title ? `: "${title}"` : ""}. You decide what happens next.`
        );
        return;
      }
      await loadMetaAndChats().catch(() => undefined);
      await sendQuestion(
        `I just saved this Daily Log${title ? ` ("${title}")` : ""}: "${saved.slice(0, 200)}". What stands out?`
      );
    } catch {
      setError("Couldn't save Daily Log. Check your connection and try again.");
    } finally {
      setSavingLog(false);
    }
  };

  const sendQuestion = async (
    questionRaw: string,
    options?: {
      attachment?: VaultMessageAttachment;
      userDisplayContent?: string;
      replaceUserMessageId?: string;
      regenerateAssistantId?: string;
    }
  ) => {
    const question = questionRaw.trim();
    if (!question || sending || vaultBusy) return;

    if (!onboardingProgress.hasAskedGideon) {
      trackOnboardingEvent("first_gideon_ask", {
        profileKind: active?.profile_type ?? null,
      });
      trackOnboardingEvent("first_gideon_question", {
        profileKind: active?.profile_type ?? null,
      });
    }

    markGideonWelcomeSeen();
    stopAssistantSpeech();
    setSending(true);
    setError(null);
    setInput("");
    setThinkingSteps([]);
    setThinkingActiveIndex(0);

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant")?.content;
    const startedBlock = parseFocusBlockStart(
      question,
      new Date(),
      timeZone,
      lastAssistant
    );
    if (startedBlock) {
      dismissedFocusEndsAtRef.current = null;
      setFocusBlock(startedBlock);
    }
    const blockForRequest = startedBlock ?? focusBlock;

    const isRegenerate = Boolean(options?.regenerateAssistantId);
    const optimisticId = `local-${Date.now()}`;
    const userContent = options?.userDisplayContent?.trim() ?? question;
    if (!options?.replaceUserMessageId && !isRegenerate) {
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          role: "user",
          content: userContent,
          attachment: options?.attachment ?? null,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    try {
      let chatIdForSend = activeChatIdRef.current ?? activeChatId;

      const postBody = withVaultChatProfileId(
        {
          question,
          chatId: chatIdForSend,
          ...(options?.regenerateAssistantId
            ? { regenerateAssistantId: options.regenerateAssistantId }
            : {}),
            ...(options?.attachment?.documentId &&
            !isPendingAttachmentId(options.attachment.documentId)
              ? { attachmentDocumentId: options.attachment.documentId }
              : {}),
          ...(requestedWorkProjectId
            ? { workProjectId: requestedWorkProjectId }
            : {}),
          ...(agentModeEnabled ? { agentMode: true } : {}),
          searchScope: meta?.searchScope ?? "workspace",
          ...(blockForRequest ? { focusBlock: blockForRequest } : {}),
        },
        vaultProfileId ?? profileId
      );

      const postOnce = () =>
        fetch("/api/documents/vault-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });

      const readErrorBody = async (response: Response) => {
        const fallbackForStatus = (status: number) => {
          if (status === 429) {
            return {
              error:
                "Rate limit reached. Wait about a minute, or set DEEPSEEK_CHAT_PRIMARY=true on Vercel to use DeepSeek for chat.",
              code: "rate_limit",
            };
          }
          if (status === 503) {
            return {
              error: "AI chat is temporarily unavailable. Please try again.",
              code: "overloaded",
            };
          }
          return {};
        };

        try {
          const body = (await response.clone().json()) as {
            error?: string;
            code?: string;
          };
          if (body.error) return body;
        } catch {
          /* not JSON */
        }
        return fallbackForStatus(response.status);
      };

      const rollbackOptimistic = () => {
        if (options?.replaceUserMessageId) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== options.replaceUserMessageId)
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      };

      let assistantStreamId: string | null = null;

      const applyVaultChatTurn = (body: {
        messages?: VaultMessage[];
        chatId?: string;
        chats?: ChatSummary[];
        chatScopedProfile?: Meta["chatScopedProfile"];
        searchScope?: SearchScopeMode;
        vaultScopeNote?: string;
        writeProfile?: { profileId: string; profileName: string };
        actionTimeline?: ActionTimelineItem[];
      }) => {
        if (body.chats) setChats(body.chats);
        const resolvedChatId = body.chatId ?? activeChatIdRef.current;
        if (resolvedChatId) {
          setActiveChatId(resolvedChatId);
          syncAskUrlRef.current(resolvedChatId);
          rememberVaultChat(vaultProfileId ?? profileId, resolvedChatId);
        }
        if (body.chatScopedProfile !== undefined) {
          setMeta((prev) =>
            prev
              ? { ...prev, chatScopedProfile: body.chatScopedProfile ?? null }
              : prev
          );
        }
        if (body.searchScope) {
          setMeta((prev) =>
            prev
              ? {
                  ...prev,
                  searchScope: body.searchScope,
                  vaultScopeNote: body.vaultScopeNote ?? prev.vaultScopeNote,
                }
              : prev
          );
        }
        if (body.writeProfile?.profileId) {
          lastWriteProfileIdRef.current = body.writeProfile.profileId;
        }
        if (body.actionTimeline) {
          setMeta((prev) =>
            prev
              ? { ...prev, actionTimeline: body.actionTimeline }
              : prev
          );
        }
        const turn = hydrateVaultChatMessages(body.messages ?? []);
        const optimisticAttachment = options?.attachment;
        const mergedTurn = turn.map((m, index) => {
          if (index === 0 && m.role === "user") {
            return overlayOptimisticAttachment(
              m,
              optimisticAttachment,
              userContent
            );
          }
          return m;
        });
        setMessages((prev) => [
          ...prev.filter(
            (m) =>
              m.id !== optimisticId &&
              m.id !== options?.replaceUserMessageId &&
              m.id !== options?.regenerateAssistantId &&
              m.id !== assistantStreamId
          ),
          ...mergedTurn,
        ]);
        dispatchAwardsFromResponse(body);
        if (resolvedChatId) {
          void loadThread(resolvedChatId, { refresh: true, silent: true });
        } else {
          void loadMetaAndChats();
        }
      };

      let res = await postOnce();

      if (!res.ok && res.status === 404 && postBody.chatId) {
        const errBody = await readErrorBody(res);
        if (
          errBody.error === "Chat not found." ||
          isChatNotFoundError(errBody.error ?? "")
        ) {
          setActiveChatId(null);
          const retryBody = { ...postBody, chatId: null };
          res = await fetch("/api/documents/vault-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(retryBody),
          });
        }
      }

      if (!res.ok) {
        const errBody = await readErrorBody(res);
        rollbackOptimistic();
        if (isRegenerate && activeChatIdRef.current) {
          void loadThread(activeChatIdRef.current, {
            refresh: true,
            silent: true,
          });
        }
        setInput(question);
        setError(
          friendlyGideonError(
            errBody.error ??
              "I couldn't complete that request right now. Please try again.",
            errBody.code
          ),
          errBody.code
        );
        return;
      }

      if (isVaultChatStreamResponse(res)) {
        const streamId = `stream-${Date.now()}`;
        assistantStreamId = streamId;
        const optimisticAttachment = options?.attachment;

        await consumeVaultChatStream(res, {
          onMeta: (event) => {
            setStreamingAssistantId(streamId);
            if (event.thinkingSteps?.length) {
              setThinkingSteps(event.thinkingSteps);
              setThinkingActiveIndex(0);
            }
            if (event.chatId) {
              setActiveChatId(event.chatId);
              syncAskUrlRef.current(event.chatId);
              rememberVaultChat(vaultProfileId ?? profileId, event.chatId);
            }
            setMessages((prev) => {
              const withoutStale = prev.filter(
                (m) =>
                  m.id !== optimisticId &&
                  m.id !== options?.replaceUserMessageId &&
                  m.id !== options?.regenerateAssistantId &&
                  m.id !== streamId
              );
              if (isRegenerate) {
                return [
                  ...withoutStale,
                  {
                    id: streamId,
                    role: "assistant",
                    content: "",
                    created_at: new Date().toISOString(),
                  },
                ];
              }
              const userFromServer: VaultMessage = overlayOptimisticAttachment(
                event.userMsg as VaultMessage,
                optimisticAttachment,
                userContent
              );
              return [
                ...withoutStale,
                userFromServer,
                {
                  id: streamId,
                  role: "assistant",
                  content: "",
                  created_at: new Date().toISOString(),
                },
              ];
            });
          },
          onThinking: (event) => {
            setThinkingSteps(event.steps);
            setThinkingActiveIndex(event.activeIndex);
          },
          onDelta: (text) => {
            setThinkingSteps([]);
            setThinkingActiveIndex(0);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: m.content + text }
                  : m
              )
            );
          },
          onDone: (event) => {
            applyVaultChatTurn(event);
            setStreamingAssistantId(null);
            setThinkingSteps([]);
            setThinkingActiveIndex(0);
          },
          onError: (message, code) => {
            setStreamingAssistantId(null);
            setThinkingSteps([]);
            setThinkingActiveIndex(0);
            setMessages((prev) =>
              prev.filter(
                (m) =>
                  m.id !== optimisticId &&
                  m.id !== options?.replaceUserMessageId &&
                  m.id !== options?.regenerateAssistantId &&
                  m.id !== streamId
              )
            );
            if (isRegenerate && activeChatIdRef.current) {
              void loadThread(activeChatIdRef.current, {
                refresh: true,
                silent: true,
              });
            }
            setInput(question);
            setError(friendlyGideonError(message, code), code);
          },
        });
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        messages?: VaultMessage[];
        chatId?: string;
        chats?: ChatSummary[];
        vaultScope?: VaultMessage["vaultScope"];
        chatScopedProfile?: Meta["chatScopedProfile"];
        writeProfile?: { profileId: string; profileName: string };
      };
      applyVaultChatTurn(body);
    } catch (err) {
      if (options?.replaceUserMessageId) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== options.replaceUserMessageId)
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      setInput(question);
      setError(
        friendlyGideonError(
          err instanceof Error && err.message.trim()
            ? err.message
            : GIDEON_GENERIC_REQUEST_ERROR
        )
      );
    } finally {
      setSending(false);
      setStreamingAssistantId(null);
      setThinkingSteps([]);
      setThinkingActiveIndex(0);
    }
  };
  sendQuestionRef.current = sendQuestion;

  useEffect(() => {
    if (sending) stopVoice();
  }, [sending, stopVoice]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    const attachment = pendingAttachment;
    if ((!question && !attachment) || sending || vaultBusy || loadingHistory) return;
    if (attachment && (!profileId || !canEditVault)) {
      setError(
        !profileId
          ? "Choose a space before uploading."
          : "You don't have permission to upload to this space."
      );
      return;
    }

    if (attachment) {
      const { file, previewUrl: stagedPreviewUrl } = attachment;
      const attachmentPreview = isImageUpload(file)
        ? URL.createObjectURL(file)
        : stagedPreviewUrl;
      clearPendingAttachment();
      setInput("");

      const userMsgId = `local-upload-${Date.now()}`;
      const userContent = question;

      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: userContent,
          attachment: {
            documentId: userMsgId,
            fileName: file.name,
            kind: isImageUpload(file) ? "image" : "document",
            previewUrl: attachmentPreview,
          },
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        const result = await uploadVaultFile(file);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsgId && m.attachment
              ? {
                  ...m,
                  attachment: {
                    ...m.attachment,
                    documentId: result.documentId,
                    fileName: result.fileName,
                  },
                }
              : m
          )
        );

        const imageUpload = isImageUpload(file);
        if (!result.analyzed && !imageUpload) {
          pushLocalNote(
            `I added "${result.fileName}" to your space, but analysis didn't finish${
              result.analysisError ? `: ${result.analysisError}` : "."
            }`
          );
          void refreshOnboarding();
          return;
        }

        if (!result.analyzed && imageUpload) {
          pushLocalNote(
            `I saved "${result.fileName}" to your space${
              result.analysisError
                ? ` (background analysis: ${result.analysisError})`
                : ""
            }. Reading the photo now…`
          );
        }

        await handleAnalyzedUpload({
          result,
          file,
          attachmentPreview,
          userMsgId,
          question,
          userDisplayContent: question,
          wasEmpty:
            !onboardingProgress.hasDocument &&
            (meta?.documentCount ?? 0) + (meta?.photoCount ?? 0) === 0,
        });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        stageVaultFile(file);
        if (question) setInput(question);
        setError(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      }
      return;
    }

    await sendQuestion(question);
  };

  const regenerateAssistantReply = (
    assistantMessage: VaultMessage,
    userMessage: VaultMessage
  ) => {
    setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
    setConfirmedReminderIds((prev) => {
      const next = new Set(prev);
      next.delete(assistantMessage.id);
      return next;
    });
    setConfirmedWorkMemoryIds((prev) => {
      const next = new Set(prev);
      next.delete(assistantMessage.id);
      return next;
    });
    setConfirmedDailyLogIds((prev) => {
      const next = new Set(prev);
      next.delete(assistantMessage.id);
      return next;
    });
    setDismissedVaultScopeIds((prev) => {
      const next = new Set(prev);
      next.delete(assistantMessage.id);
      return next;
    });
    void sendQuestion(userMessage.content, {
      regenerateAssistantId: assistantMessage.id,
      attachment: messageAttachments(userMessage)[0],
    });
  };

  const renderAssistantContent = (
    m: VaultMessage,
    options?: {
      hideCitationPreviews?: boolean;
      userMessage?: VaultMessage;
      isStreaming?: boolean;
      showSuggestedQuestions?: boolean;
    }
  ) => {
    const proposedReminder = parseProposedReminder(m.content, Date.now(), timeZone);
    const proposedDailyLog = parseProposedDailyLog(m.content, todayLogDate(timeZone));
    const proposedWorkMemory = parseProposedWorkMemoryUpdate(
      m.content,
      requestedWorkProjectId ?? workProject?.id
    );
    const proposedClientRequest = parseProposedClientRequestReply(
      m.content,
      requestedRequestId
    );
    const proposedClientRequestCreate = parseProposedClientRequestCreate(
      m.content,
      active?.profile_type === "client" ? active.id : null
    );
    const proposedSpaceCreate = parseProposedSpaceCreate(m.content);
    const displayContent = stripFocusBlockSection(
      stripProposedSpaceCreateSection(
        stripProposedDailyLogSection(
          stripProposedClientRequestCreateSection(
            stripProposedClientRequestReplySection(
              stripProposedWorkMemoryUpdateSection(
                stripProposedReminderSection(m.content)
              )
            )
          )
        )
      )
    );
    const sections = parseGideonSections(
      displayContent ||
        (proposedReminder ||
        proposedDailyLog ||
        proposedWorkMemory ||
        proposedClientRequest ||
        proposedClientRequestCreate ||
        proposedSpaceCreate
          ? ""
          : m.content)
    );
    const citations = Array.isArray(m.citations) ? m.citations : [];
    const uniqueCitations = [
      ...new Map(citations.map((c) => [c.documentId, c])).values(),
    ];
    const imageCitations = [
      ...new Map(
        uniqueCitations
          .filter((c) => c.isImage || isImageFileName(c.fileName))
          .map((c) => [c.fileName.trim().toLowerCase(), c])
      ).values(),
    ];
    const youtubeLinks = extractYouTubeUrls(m.content ?? "");
    const answerText = m.content ?? "";
    const sourceNamedInAnswer = (c: Citation) =>
      citationNamedInText(
        {
          fileName: c.fileName,
          profileName: c.profileName,
          cardName: c.cardName,
        },
        answerText
      );
    // Vault images/PDFs only when the answer names them (no stray party invites).
    const vaultImages = imageCitations
      .filter((c) => c.kind !== "connector")
      .filter((c) => sourceNamedInAnswer(c));
    // Trust server-picked connector citations only when the answer names them.
    // preferChartsMatchingKeyInText alone can return the first 2 unnamed PDFs.
    const connectorImages = preferChartsMatchingKeyInText(
      imageCitations.filter((c) => c.kind === "connector"),
      answerText,
      2
    ).filter((c) => sourceNamedInAnswer(c));
    // Connector PDFs: same — must be named in the answer.
    const connectorPdfs = preferChartsMatchingKeyInText(
      uniqueCitations.filter(
        (c) =>
          c.kind === "connector" &&
          !c.isImage &&
          !isImageFileName(c.fileName) &&
          (/\.pdf$/i.test(c.fileName) ||
            Boolean(c.mimeType?.includes("pdf")))
      ),
      answerText,
      2
    ).filter((c) => sourceNamedInAnswer(c));
    // Non-image vault Sources must also be named in the answer.
    const sourceCitations = uniqueCitations.filter((c) => {
      if (c.isImage || isImageFileName(c.fileName)) return false;
      if (c.kind === "connector") {
        // Shown as preview cards above; keep link-only for non-PDF docs.
        if (/\.pdf$/i.test(c.fileName) || c.mimeType?.includes("pdf")) {
          return false;
        }
        return sourceNamedInAnswer(c);
      }
      return sourceNamedInAnswer(c);
    });
    // Prefer files listed on Source: lines when present.
    const explicitSourceNames = extractExplicitSourceFileNames(answerText).map(
      (n) => n.toLowerCase()
    );
    const matchesExplicit = (c: Citation) =>
      explicitSourceNames.length === 0 ||
      explicitSourceNames.some(
        (n) =>
          c.fileName.toLowerCase() === n ||
          c.fileName.toLowerCase().includes(n.replace(/\.[^.]+$/, ""))
      );
    // Preview cards only for images + connector chart PDFs. Vault docs (JSON,
    // notes, etc.) stay as Source links — no file thumbnail above the answer.
    const vaultPreviewCitations = [
      ...vaultImages,
      ...connectorImages,
      ...connectorPdfs,
    ].filter(matchesExplicit);
    const previewCitations = options?.hideCitationPreviews
      ? []
      : vaultPreviewCitations;
    const linkOnlyCitations = options?.hideCitationPreviews
      ? []
      : sourceCitations;

    const alreadySetReminder = confirmedReminderIds.has(m.id);
    const confirmingReminder = confirmingReminderId === m.id;
    const alreadySavedDailyLog = confirmedDailyLogIds.has(m.id);
    const confirmingDailyLog = confirmingDailyLogId === m.id;
    const alreadySetWorkMemory = confirmedWorkMemoryIds.has(m.id);
    const confirmingWorkMemory = confirmingWorkMemoryId === m.id;
    const alreadyPostedClientRequest = confirmedClientRequestIds.has(m.id);
    const confirmingClientRequest = confirmingClientRequestId === m.id;
    const alreadyCreatedClientRequest = confirmedClientRequestCreateIds.has(m.id);
    const confirmingClientRequestCreate =
      confirmingClientRequestCreateId === m.id;
    const clientVaultName = proposedClientRequestCreate
      ? profiles.find((p) => p.id === proposedClientRequestCreate.profileId)
          ?.display_name
      : null;
    const alreadyCreatedSpace = confirmedSpaceCreateIds.has(m.id);
    const confirmingSpaceCreate = confirmingSpaceCreateId === m.id;
    const spaceCreateParentChoice = proposedSpaceCreate
      ? (spaceCreateParentChoices.get(m.id) ??
        defaultParentChoice(proposedSpaceCreate, profiles, profileId))
      : null;
    const spaceCreateValidParents = proposedSpaceCreate
      ? validParentProfilesForChild(profiles, proposedSpaceCreate.profileType)
      : [];
    const spaceCreateAllowsTopLevel = proposedSpaceCreate
      ? !profileTypeRequiresParent(proposedSpaceCreate.profileType)
      : false;
    const spaceCreateNeedsPicker = proposedSpaceCreate
      ? spaceCreateNeedsPlacementPicker(proposedSpaceCreate, profiles)
      : false;
    const vaultScope = m.vaultScope;
    const showVaultScopeCard =
      vaultScope &&
      !dismissedVaultScopeIds.has(m.id) &&
      vaultScope.profileId !== effectiveProfile?.id;
    const switchingVault = switchingVaultScopeId === m.id;
    const plainText = formatAssistantMessagePlainText(m.content);
    const speechText = formatAssistantMessageSpeechText(m.content);
    const showActions =
      !options?.isStreaming && Boolean(plainText.trim() || m.content.trim());

    return (
      <div className="min-w-0 flex-1 space-y-2">
        {previewCitations.length > 0 || youtubeLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {previewCitations.map((c) => (
              <VaultAttachmentCard
                key={`att-${c.documentId}`}
                documentId={c.documentId}
                fileName={c.fileName}
                displayName={c.cardName?.trim() || c.fileName}
                kind={
                  c.isImage || isImageFileName(c.fileName) ? "image" : "document"
                }
                citationKind={c.kind}
                sourceId={c.sourceId}
                itemId={c.itemId}
              />
            ))}
            {youtubeLinks.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[11rem] flex-col items-start justify-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-stone-50"
                title={url}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  YouTube
                </span>
                <span className="text-xs font-semibold text-brand">
                  Watch on YouTube
                </span>
              </a>
            ))}
          </div>
        ) : null}
        {sections.map((sec, i) => (
          <div
            key={`${m.id}-${i}`}
            className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${SECTION_STYLES[sec.kind] ?? SECTION_STYLES.body}`}
          >
            {sec.title && (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {sec.title}
              </p>
            )}
            <p className="whitespace-pre-wrap text-foreground/90">
              {renderGideonText(sec.content)}
            </p>
          </div>
        ))}
        {proposedReminder ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">
              Proposed reminder
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {proposedReminder.title}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {proposedReminderWhenLabel(proposedReminder, timeZone)}
            </p>
            {m.vaultScope ? (
              <p className="mt-1 text-xs text-amber-900/80">
                Will save to {m.vaultScope.profileName}&apos;s vault
              </p>
            ) : null}
            {alreadySetReminder ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Reminder saved. You decide what happens next.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    confirmingReminder || savingReminder || sending || vaultBusy
                  }
                  onClick={() =>
                    void confirmProposedReminder(
                      m.id,
                      proposedReminder,
                      m.vaultScope?.profileId
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirmingReminder ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  Create reminder
                </button>
                <button
                  type="button"
                  disabled={confirmingReminder || savingReminder}
                  onClick={() => {
                    setReminderTargetProfileId(m.vaultScope?.profileId ?? null);
                    setReminderTitle(proposedReminder.title);
                    setReminderDate(proposedReminder.date);
                    setReminderTime(proposedReminder.time);
                    setReminderOpen(true);
                  }}
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Edit first
                </button>
              </div>
            )}
          </div>
        ) : null}
        {proposedDailyLog ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900/70">
              Proposed Daily Log
            </p>
            <p className="mt-1 text-sm text-foreground">
              {proposedDailyLogSummary(proposedDailyLog, timeZone)}
            </p>
            {m.vaultScope ? (
              <p className="mt-1 text-xs text-violet-900/80">
                Will save to {m.vaultScope.profileName}&apos;s vault
              </p>
            ) : null}
            {alreadySavedDailyLog ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Daily Log saved to your vault.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    confirmingDailyLog || savingLog || sending || vaultBusy
                  }
                  onClick={() =>
                    void confirmProposedDailyLog(
                      m.id,
                      proposedDailyLog,
                      m.vaultScope?.profileId
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirmingDailyLog ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <NotebookPen className="h-3.5 w-3.5" />
                  )}
                  Save to space
                </button>
                <button
                  type="button"
                  disabled={confirmingDailyLog || savingLog}
                  onClick={() => {
                    pendingDailyLogMessageIdRef.current = m.id;
                    setLogTitle(proposedDailyLog.title ?? "");
                    setLogContent(proposedDailyLog.content);
                    setLogOpen(true);
                  }}
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Edit first
                </button>
              </div>
            )}
          </div>
        ) : null}
        {proposedWorkMemory ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/70">
              Proposed Work Memory update
            </p>
            <p className="mt-1 text-sm text-foreground">
              {proposedWorkMemoryUpdateSummary(
                proposedWorkMemory,
                workProject?.id === proposedWorkMemory.projectId
                  ? workProject.name
                  : null
              )}
            </p>
            {alreadySetWorkMemory ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Project updated in Work Memory.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    confirmingWorkMemory ||
                    savingWorkMemory ||
                    sending ||
                    vaultBusy
                  }
                  onClick={() =>
                    void confirmProposedWorkMemoryUpdate(m.id, proposedWorkMemory)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirmingWorkMemory ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Brain className="h-3.5 w-3.5" />
                  )}
                  Update project
                </button>
                <Link
                  href={`/work-memory/${proposedWorkMemory.projectId}`}
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Open in Work Memory
                </Link>
              </div>
            )}
          </div>
        ) : null}
        {proposedClientRequestCreate ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
              Proposed client request
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {proposedClientRequestCreate.title}
            </p>
            {clientVaultName ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                Client vault: {clientVaultName}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {proposedClientRequestCreate.description}
            </p>
            {proposedClientRequestCreate.initialMessage &&
            proposedClientRequestCreate.initialMessage !==
              proposedClientRequestCreate.description ? (
              <p className="mt-2 text-xs text-ink-muted">
                First message: {proposedClientRequestCreate.initialMessage}
              </p>
            ) : null}
            {proposedClientRequestCreate.assignedToName ? (
              <p className="mt-1 text-xs text-ink-muted">
                Assign to teammate: {proposedClientRequestCreate.assignedToName}
              </p>
            ) : null}
            {alreadyCreatedClientRequest ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-emerald-800">
                  Client request created.
                </p>
                {createdClientRequestIds.get(m.id) ? (
                  <Link
                    href={`/requests?id=${createdClientRequestIds.get(m.id)}`}
                    className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                  >
                    Open request
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    confirmingClientRequestCreate ||
                    savingClientRequestCreate ||
                    sending ||
                    vaultBusy
                  }
                  onClick={() =>
                    void confirmProposedClientRequestCreate(
                      m.id,
                      proposedClientRequestCreate
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirmingClientRequestCreate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  Create request
                </button>
                <Link
                  href="/requests"
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Open Requests
                </Link>
              </div>
            )}
          </div>
        ) : null}
        {proposedSpaceCreate ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">
              Proposed {getContainerLabel(proposedSpaceCreate.profileType)}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {proposedSpaceCreate.displayName}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {spaceCreatePlacementLabel(
                proposedSpaceCreate,
                spaceCreateParentChoice,
                profiles
              )}
            </p>
            {alreadyCreatedSpace ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-emerald-800">
                  Space created and switched.
                </p>
                {createdSpaceProfileIds.get(m.id) ? (
                  <button
                    type="button"
                    onClick={() =>
                      void switchProfile(createdSpaceProfileIds.get(m.id)!)
                    }
                    className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                  >
                    Open space
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {spaceCreateNeedsPicker ? (
                  <>
                    <label className="block text-xs font-semibold text-amber-900/80">
                      Where should this live?
                    </label>
                    <select
                      value={
                        spaceCreateParentChoice === null &&
                        spaceCreateAllowsTopLevel
                          ? "__top__"
                          : spaceCreateParentChoice ?? ""
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSpaceCreateParentChoices((prev) =>
                          new Map(prev).set(
                            m.id,
                            value === "__top__" ? null : value
                          )
                        );
                      }}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm text-foreground"
                    >
                      {spaceCreateAllowsTopLevel ? (
                        <option value="__top__">
                          Top level (independent space)
                        </option>
                      ) : null}
                      {spaceCreateValidParents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          Under {parent.display_name} (
                          {getContainerLabel(parent.profile_type).toLowerCase()})
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={
                      confirmingSpaceCreate ||
                      savingSpaceCreate ||
                      sending ||
                      vaultBusy ||
                      (profileTypeRequiresParent(proposedSpaceCreate.profileType) &&
                        !spaceCreateParentChoice)
                    }
                    onClick={() =>
                      void confirmProposedSpaceCreate(
                        m.id,
                        proposedSpaceCreate,
                        spaceCreateParentChoice
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                  >
                    {confirmingSpaceCreate ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                    Create space
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {proposedClientRequest ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
              Proposed client request reply
            </p>
            <p className="mt-1 text-sm text-foreground">
              {proposedClientRequestReplySummary(proposedClientRequest)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {proposedClientRequest.content}
            </p>
            {alreadyPostedClientRequest ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Reply posted on the request thread.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    confirmingClientRequest ||
                    savingClientRequestReply ||
                    sending ||
                    vaultBusy
                  }
                  onClick={() =>
                    void confirmProposedClientRequestReply(
                      m.id,
                      proposedClientRequest
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirmingClientRequest ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  Post reply
                </button>
                <Link
                  href={`/requests?id=${proposedClientRequest.requestId}`}
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Open request
                </Link>
              </div>
            )}
          </div>
        ) : null}
        {showVaultScopeCard ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900/70">
              Answered from another space
            </p>
            <p className="mt-1 text-sm text-foreground">
              This came from <span className="font-medium">{vaultScope.profileName}</span>
              &apos;s space. You&apos;re still in{" "}
              <span className="font-medium">{vaultScope.activeProfileName}</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!scopedProfileId && !isDrawer ? (
                <button
                  type="button"
                  disabled={switchingVault || sending || vaultBusy}
                  onClick={() =>
                    openSideVault(
                      vaultScope.profileId,
                      vaultScope.profileName,
                      m.id
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-50 disabled:opacity-60"
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                  Open {vaultScope.profileName}&apos;s space here
                </button>
              ) : null}
              <button
                type="button"
                disabled={switchingVault || sending || vaultBusy}
                onClick={() =>
                  void continueInScopedVault(
                    vaultScope.profileId,
                    vaultScope.profileName,
                    m.id
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
              >
                {switchingVault ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                )}
                Continue in {vaultScope.profileName}&apos;s space
              </button>
              <button
                type="button"
                disabled={switchingVault}
                onClick={() => void dismissVaultScope(m.id)}
                className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
              >
                Stay in {vaultScope.activeProfileName}
              </button>
            </div>
          </div>
        ) : null}
        {linkOnlyCitations.length > 0 ? (
          <div className="space-y-2 pt-1">
            {linkOnlyCitations.map((c) => (
              <div
                key={c.documentId}
                className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted"
              >
                <span>
                  Source:{" "}
                  <span className="font-medium text-foreground">
                    {c.profileName
                      ? `${c.profileName} · ${c.cardName?.trim() || c.fileName}`
                      : c.cardName?.trim() || c.fileName}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void viewSource(c)}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 font-semibold text-brand transition hover:bg-stone-50"
                >
                  {c.kind === "connector" ? "Open file" : "View source"}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {!options?.isStreaming &&
        options?.showSuggestedQuestions &&
        m.role === "assistant" &&
        Array.isArray(m.suggestedQuestions) &&
        m.suggestedQuestions.length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              You might also ask
            </p>
            <div className="flex flex-wrap gap-2">
              {m.suggestedQuestions.slice(0, 4).map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending || vaultBusy || Boolean(streamingAssistantId)}
                  onClick={() => void sendQuestion(q)}
                  className="min-h-10 max-w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-left text-xs font-medium leading-snug text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50 sm:min-h-0 sm:rounded-full sm:py-1.5"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {showActions ? (
          <GideonAssistantActions
            messageId={m.id}
            plainText={plainText}
            speechText={speechText}
            speaking={speakingMessageId === m.id}
            speechSupported={speechOutputSupported}
            disabled={sending || vaultBusy || Boolean(streamingAssistantId)}
            canRegenerate={Boolean(options?.userMessage && activeChatId)}
            onSpeak={speakAssistant}
            onRegenerate={
              options?.userMessage
                ? () =>
                    regenerateAssistantReply(m, options.userMessage!)
                : undefined
            }
          />
        ) : null}
      </div>
    );
  };

  const welcome = !loadingHistory && messages.length === 0 && !sending;
  const docCount = meta?.documentCount ?? 0;
  const photoCount = meta?.photoCount ?? 0;
  const logCount = meta?.logCount ?? 0;
  const connectedCount = meta?.connectedItemCount ?? 0;
  const fileCount = docCount + photoCount;
  const emptyVault = fileCount === 0 && logCount === 0 && connectedCount === 0;
  const quickActions = meta?.quickActions?.length
    ? meta.quickActions
    : GIDEON_QUICK_ACTIONS;
  const showExpandedWelcome = emptyVault && !gideonWelcomeSeen;
  const showMinimalWelcome = !showExpandedWelcome;
  const logsOnly = fileCount === 0 && logCount > 0;
  const greetName = meta?.firstName;
  const hasOtherSpaces = topLevelProfiles(profiles).length > 1;
  const showCreateSpaceShortcuts = showExpandedWelcome || hasOtherSpaces;
  const uploadCtaLabel = uploadCtaForProfileKind(active?.profile_type);
  const exampleUploads = (
    meta?.guidance?.suggestedUploads?.length
      ? meta.guidance.suggestedUploads
      : [...TRY_GUARDIAN_EXAMPLES]
  ).slice(0, 4);

  const countBits: string[] = [];
  if (meta?.practiceStatsLine) {
    countBits.push(meta.practiceStatsLine);
  }
  if (docCount > 0) {
    countBits.push(
      meta?.practiceStatsLine
        ? `${docCount} uploaded doc${docCount === 1 ? "" : "s"}`
        : `${docCount} document${docCount === 1 ? "" : "s"}`
    );
  }
  if (photoCount > 0) {
    countBits.push(
      meta?.practiceStatsLine
        ? `${photoCount} uploaded photo${photoCount === 1 ? "" : "s"}`
        : `${photoCount} photo${photoCount === 1 ? "" : "s"}`
    );
  }
  if (logCount > 0) {
    countBits.push(`${logCount} Daily Log${logCount === 1 ? "" : "s"}`);
  }

  const practiceStats = meta?.practiceStats ?? null;
  const showPracticeStats = Boolean(meta?.practiceStatsLine);

  const templateBadge =
    meta?.guidance?.badge ?? meta?.templateBadge ?? null;

  const runFirstMemoryAction = (id: FirstMemoryActionId) => {
    if (id === "document") openFilePicker();
    else if (id === "daily_log" || id === "meeting_notes") openLogForm();
    else if (id === "photo") openCamera();
    else if (id === "schedule") openReminderForm();
  };

  const welcomeBlock = welcome && (
    isPage && showMinimalWelcome && !emptyVault ? (
      <div className="mx-auto max-w-xl px-1 py-4 sm:py-6">
        <GideonWelcome showAskForm={false} />
      </div>
    ) : (
    <div
      className={
        showMinimalWelcome && !emptyVault
          ? "mx-auto max-w-xl px-1 py-2"
          : "mx-auto max-w-xl space-y-4 px-1 py-4 sm:py-6"
      }
    >
      {!showMinimalWelcome && isPage ? <OnboardingProgressChip /> : null}
      {!showMinimalWelcome && meta?.actionTimeline && meta.actionTimeline.length > 0 ? (
        <GideonActionTimeline events={meta.actionTimeline} />
      ) : null}
      {!showMinimalWelcome &&
      meta?.proactiveSuggestions &&
      meta.proactiveSuggestions.length > 0 ? (
        <GideonProactiveSuggestions suggestions={meta.proactiveSuggestions} />
      ) : null}
      {!showMinimalWelcome &&
      meta?.workspaceTimeline &&
      meta.workspaceTimeline.length > 0 ? (
        <GideonWorkspaceTimeline events={meta.workspaceTimeline} />
      ) : null}
      <div className="flex items-start gap-3">
        <GideonAvatar size={showMinimalWelcome && !emptyVault ? 40 : 44} />
        <div className="min-w-0 space-y-3">
          {showMinimalWelcome && !emptyVault ? (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                {GIDEON_RETURNING_PROMPT}
              </p>
              {showPracticeStats ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5">
                  <button
                    type="button"
                    disabled={sending || loadingHistory}
                    onClick={() =>
                      void sendQuestion(
                        practiceStatsListPrompt("songs", meta?.boardName)
                      )
                    }
                    className="text-left text-xs font-semibold text-foreground transition hover:text-brand disabled:opacity-50"
                    title="Show song list"
                  >
                    {meta?.practiceStatsLine}
                  </button>
                  {practiceStats ? (
                    <PracticeStatsChips
                      stats={practiceStats}
                      boardName={meta?.boardName}
                      disabled={sending || loadingHistory}
                      onAsk={(prompt) => void sendQuestion(prompt)}
                    />
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-ink-muted">
                    Tap a count to open the list
                  </p>
                </div>
              ) : null}
              <p className="text-[11px] font-medium text-ink-muted">
                {GIDEON_CHIEF_OF_STAFF_TAGLINE}
              </p>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={sending || loadingHistory}
                    onClick={() => void sendQuestion(action.prompt)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {!emptyVault && meta && meta.suggestions.length > 0 ? (
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

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openFilePicker}
                  className="inline-flex rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  📄 {uploadCtaLabel}
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={openCamera}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  📷 Scan with camera
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId || !canEditVault}
                  onClick={() => void runSampleDocument()}
                  className="inline-flex rounded-full border border-brand/40 bg-brand-light/50 px-4 py-2.5 text-sm font-semibold text-brand-dark transition hover:bg-brand-light disabled:opacity-50"
                >
                  ✨ Try with a sample
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
                Upload something first — then try asking Gideon about it.
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
          ? "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-8"
          : "max-h-64 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200"
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
                    <div className="rounded-2xl bg-stone-100 px-3.5 py-2 text-sm text-foreground">
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

  const workspaceContextBar = workingInDisplay ? (
    <div
      className={
        isPage || isDrawer
          ? "shrink-0 border-b border-stone-100 px-4 py-2 sm:px-8"
          : "mb-2 px-0.5"
      }
    >
      <div className={isPage ? "mx-auto max-w-3xl" : undefined}>
        <WorkspaceContextBar
          display={workingInDisplay}
          profiles={profiles}
          activeProfileId={effectiveProfile?.id ?? profileId ?? ""}
          onSwitchWorkspace={(id) => void switchProfile(id)}
          onReturnToWorkspace={
            workingInDisplay.mode === "searching"
              ? () => void clearChatScopedProfile()
              : undefined
          }
          onOpenSearch={
            isPage ? () => setVaultSearchOpen(true) : undefined
          }
          searchScope={meta?.searchScope ?? "workspace"}
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
          ? `shrink-0 border-t border-stone-200 bg-white px-4 pt-3 sm:px-8 ${
              reserveSimpleNav ? "pb-simple-nav" : "pb-3"
            }`
          : "mt-3"
      }
    >
      <div className={isPage ? "mx-auto w-full max-w-3xl" : "w-full"}>
        <div className="relative rounded-2xl border border-stone-200 bg-white shadow-sm focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/20">
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
      <div className="flex h-full w-full items-center justify-center bg-white px-4">
        {setupBlock}
      </div>
    );
  }

  if (isDrawer) {
    return (
      <div className="flex h-full min-h-0 flex-col">
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
    <div className="flex h-full w-full overflow-hidden bg-white">
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-stone-200 bg-stone-50 transition-[width] duration-200 md:flex ${
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
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-stone-50 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
              <span className="text-sm font-semibold">Vaults &amp; chats</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-ink-muted hover:bg-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{askSidebar}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-stone-100 md:hidden"
            aria-label="Open spaces and chats"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          {sidebarCollapsed ? (
            <button
              type="button"
              className="hidden rounded-full p-2 text-ink-muted hover:bg-stone-100 md:inline-flex"
              aria-label="Expand sidebar"
              title="Expand sidebar"
              onClick={() => {
                setSidebarCollapsed(false);
                persistAskSidebarCollapsed(false);
              }}
            >
              <PanelRightOpen className="h-5 w-5" />
            </button>
          ) : null}
          <GideonAvatar size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <AskTitleProfileSwitch
                title={
                  chats.find((c) => c.id === activeChatId)?.title ?? "Ask Gideon"
                }
              />
              <button
                type="button"
                onClick={() => setWhyOpen((o) => !o)}
                aria-label="About Gideon"
                className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="truncate text-[11px] text-ink-muted">
              {GIDEON_CHIEF_OF_STAFF_TAGLINE}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <AgentModeToggle compact className="hidden sm:inline-flex" />
            <Link
              href="/settings/connections"
              aria-label="Connections"
              title="Connections"
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
            >
              <FolderOpen className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
              <span className="hidden sm:inline">Connections</span>
            </Link>
            <Link
              href={docsHref}
              aria-label={VAULT_NAV_LABEL}
              title={VAULT_NAV_LABEL}
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
            >
              <span className="text-ink-muted" aria-hidden>
                ←
              </span>
              {VAULT_NAV_LABEL}
            </Link>
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-stone-50 md:hidden"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New
            </button>
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
          <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-8">
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
    </>
  );
}
