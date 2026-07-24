"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PlanLimitAlert from "@/components/PlanLimitAlert";
import {
  ExternalLink,
  FileUp,
  Camera,
  Bell,
  FileText,
  Info,
  Loader2,
  Menu,
  MessageSquarePlus,
  Mic,
  NotebookPen,
  Paperclip,
  Plus,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GideonAvatar from "@/components/GideonAvatar";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import ImminentReminderBanner from "@/components/ImminentReminderBanner";
import {
  AskTitleProfileSwitch,
  AskWelcomeProfileSwitch,
} from "@/components/ProfileSwitcher";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  VAULT_CREATE_CARDS,
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
  GIDEON_WHY,
  ORGANIZE_EXAMPLES,
  ORGANIZE_INTRO,
  PRIVACY_CARD_POINTS,
  PRIVACY_CARD_TITLE,
  TRY_GUARDIAN_EXAMPLES,
  TRY_GUARDIAN_SUBTITLE,
  TRY_GUARDIAN_TITLE,
  VAULT_SCOPE_NOTE,
  WELCOME_AI_MEMORY_BODY,
  WELCOME_AI_MEMORY_TITLE,
  parseGideonSections,
  type FirstMemoryActionId,
} from "@/lib/vault/gideon";
import { isImageFileName } from "@/lib/vault/images";
import { renderPdfThumbnailFromFile, renderPdfThumbnailFromUrl } from "@/lib/vault/pdfThumbnail";
import { renderGideonText } from "@/components/gideonText";
import { uploadAndAnalyzeToVault } from "@/lib/vault/clientUpload";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import AskGideonSidebar from "@/components/AskGideonSidebar";
import { todayLogDate } from "@/lib/logs/types";
import { calendarDateInZone } from "@/lib/reminders/time";
import {
  parseProposedReminder,
  proposedReminderWhenLabel,
  stripProposedReminderSection,
  type ProposedReminder,
} from "@/lib/reminders/propose";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { dispatchAwardsFromResponse } from "@/lib/awards/client";
import { useGideonVoiceInput } from "@/hooks/useGideonVoiceInput";
import { documentsHref } from "@/lib/routes";
import type { WorkProject } from "@/lib/work-memory/types";

function defaultReminderDateTime(): { date: string; time: string } {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const date = calendarDateInZone(inOneHour, GUARDIAN_TIME_ZONE);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: GUARDIAN_TIME_ZONE,
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
};

type VaultMessageAttachment = {
  documentId: string;
  fileName: string;
  kind: "image" | "document";
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

function VaultAttachmentCard({
  documentId,
  fileName,
  kind,
  previewUrl,
  compact = true,
}: {
  documentId: string;
  fileName: string;
  kind: "image" | "document";
  previewUrl?: string | null;
  compact?: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = kind === "image" || isImageFileName(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  const pending = isPendingAttachmentId(documentId);
  const [pdfThumb, setPdfThumb] = useState<string | null>(
    isPdf && previewUrl ? previewUrl : null
  );

  useEffect(() => {
    setImageFailed(false);
    if (pending) {
      setSignedUrl(null);
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
  }, [documentId, pending, isImage]);

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
    ? "inline-flex w-[7.5rem] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
    : "block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm";
  const href = signedUrl ?? (isImage ? previewUrl : null);
  const visualSrc = isImage ? previewUrl ?? signedUrl : pdfThumb;

  if (imageFailed && isImage) {
    return (
      <div className={`${shell} p-2 text-[10px] text-ink-muted`} title={fileName}>
        Couldn&apos;t load preview
      </div>
    );
  }

  const thumb = (
    <div
      className={`relative bg-stone-50 ${
        compact ? "h-24 w-full" : "min-h-[8rem] w-full"
      }`}
    >
      {visualSrc ? (
        <img
          src={visualSrc}
          alt={fileName}
          className={
            compact
              ? "h-full w-full object-cover object-top"
              : "max-h-72 w-full object-contain"
          }
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
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={shell}
        title={fileName}
      >
        {thumb}
      </a>
    );
  }

  return (
    <div className={shell} title={fileName}>
      {thumb}
    </div>
  );
}

type VaultMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  attachment?: VaultMessageAttachment | null;
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
  profileId?: string;
  profileName?: string;
  askContextLabel?: string;
  chatContextLabel?: string;
  vaultScopeNote?: string;
  templateLabel?: string;
  templateBadge?: string;
  guidance?: {
    headline: string;
    intro: string;
    tips: string[];
    badge?: string;
    label?: string;
    suggestedUploads?: string[];
  } | null;
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

type Props = {
  variant?: "embedded" | "page";
};

const SECTION_STYLES: Record<string, string> = {
  from_documents: "border-brand/30 bg-brand-light/40",
  from_daily_log: "border-emerald-200 bg-emerald-50/80",
  from_profiles: "border-teal-200 bg-teal-50/80",
  from_work_memory: "border-indigo-200 bg-indigo-50/70",
  calculated: "border-sky-200 bg-sky-50/80",
  general_knowledge: "border-stone-200 bg-stone-50/90",
  suggestion: "border-violet-200 bg-violet-50/70",
  needs_verification: "border-amber-200 bg-amber-50/80",
  body: "border-transparent bg-transparent",
};

export default function VaultChatPanel({ variant = "embedded" }: Props) {
  const isPage = variant === "page";
  const searchParams = useSearchParams();
  const requestedChatId = searchParams.get("chatId");
  const requestedProfileId = searchParams.get("profileId");
  const requestedWorkProjectId = searchParams.get("projectId");
  const { active, profiles, loading: profilesLoading, switchProfile, refresh } =
    useActiveProfile();
  const needsSetup = !profilesLoading && profiles.length === 0;
  const bootstrapTried = useRef(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
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
  const [whyOpen, setWhyOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logContent, setLogContent] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
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
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingVaultAttachment | null>(null);
  const [workProject, setWorkProject] = useState<WorkProject | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentRef = useRef<PendingVaultAttachment | null>(null);
  const profileSwitchRef = useRef(false);
  const deepLinkChatConsumed = useRef<string | null>(null);
  const workProjectPrefillDone = useRef(false);
  const sendQuestionRef = useRef<(questionRaw: string) => Promise<void>>(
    async () => {}
  );
  const inputId = isPage ? "ask-gideon-page-input" : "ask-gideon-input";
  const profileId = active?.id ?? meta?.profileId ?? null;

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
    disabled: sending || vaultBusy || !profileId,
  });
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

  const loadMetaAndChats = useCallback(async () => {
    const res = await fetch("/api/documents/vault-chat");
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      chats?: ChatSummary[];
      meta?: Meta;
    };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load Ask Gideon.");
    setChats(body.chats ?? []);
    if (body.meta) setMeta(body.meta);
    return body.chats ?? [];
  }, []);

  const loadThread = useCallback(async (chatId: string) => {
    const res = await fetch(
      `/api/documents/vault-chat?chatId=${encodeURIComponent(chatId)}`
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      chats?: ChatSummary[];
      messages?: VaultMessage[];
      chatId?: string;
      meta?: Partial<Meta>;
    };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load chat.");
    if (body.chats) setChats(body.chats);
    setActiveChatId(body.chatId ?? chatId);
    setMessages(body.messages ?? []);
    if (body.meta) {
      setMeta((prev) => ({
        firstName: prev?.firstName ?? null,
        documentCount: 0,
        suggestions: prev?.suggestions ?? [],
        ...prev,
        ...body.meta,
      }));
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const list = await loadMetaAndChats();
      const deepChat =
        requestedChatId &&
        deepLinkChatConsumed.current !== requestedChatId
          ? requestedChatId
          : null;
      if (deepChat) {
        deepLinkChatConsumed.current = deepChat;
        await loadThread(deepChat);
      } else if (list[0]) {
        // Resume the most recent chat for this profile (Docs ↔ Ask continuity).
        await loadThread(list[0].id);
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load Ask Gideon.");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [loadMetaAndChats, loadThread, requestedChatId]);

  useEffect(() => {
    if (profilesLoading || profiles.length > 0 || bootstrapTried.current) return;
    bootstrapTried.current = true;
    void refresh();
  }, [profilesLoading, profiles.length, refresh]);

  useEffect(() => {
    if (profilesLoading || needsSetup || profileSwitchRef.current) return;
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
    profiles,
    switchProfile,
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
    if (profilesLoading) return;
    if (needsSetup) {
      setLoadingHistory(false);
      return;
    }
    if (requestedProfileId && active?.id !== requestedProfileId) {
      // Wait until profile switch lands before loading chats.
      return;
    }
    void bootstrap();
  }, [
    bootstrap,
    needsSetup,
    profilesLoading,
    requestedProfileId,
    active?.id,
  ]);

  useEffect(() => {
    if (needsSetup) return;
    const onProfile = () => {
      setActiveChatId(null);
      setMessages([]);
      void bootstrap();
    };
    window.addEventListener("guardian:profile-changed", onProfile);
    return () =>
      window.removeEventListener("guardian:profile-changed", onProfile);
  }, [bootstrap, needsSetup]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, vaultBusy, vaultStatus, savingLog]);

  useEffect(() => {
    if (!sending && !vaultBusy && !savingLog) return;
    if (savingLog) {
      setLoadingLabel("Saving to your vault…");
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
    const onKey = (e: KeyboardEvent) => {
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
    const onKey = (e: KeyboardEvent) => {
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
    setSidebarOpen(false);
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
      await loadThread(chatId);
      setSidebarOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load chat.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteChat = async (chatId: string, e: MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/vault-chat?chatId=${encodeURIComponent(chatId)}`,
        { method: "DELETE" }
      );
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
      }
    } catch {
      setError("Couldn't delete chat.");
    }
  };

  const viewSource = async (documentId: string, fileName: string) => {
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
      throw new Error("Choose a vault before uploading.");
    }
    setError(null);
    setVaultBusy(true);
    setVaultStatus("Uploading to your vault…");

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
    setLogTitle("");
    setLogContent("");
    setLogOpen(true);
  };

  const openReminderForm = () => {
    setPlusOpen(false);
    const defaults = defaultReminderDateTime();
    setReminderTitle("");
    setReminderDate(defaults.date);
    setReminderTime(defaults.time);
    setReminderOpen(true);
  };

  const saveInlineReminder = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !profileId ||
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
          profileId,
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
    proposal: ProposedReminder
  ) => {
    if (!profileId || confirmingReminderId || savingReminder || vaultBusy || sending) {
      return;
    }
    setConfirmingReminderId(messageId);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
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
        body.whenLabel ?? proposedReminderWhenLabel(proposal);
      pushLocalNote(
        `Reminder set: "${title}" — ${when}. You'll see it under Attention on the dashboard.`
      );
    } catch {
      setError("Couldn't save reminder. Check your connection and try again.");
    } finally {
      setConfirmingReminderId(null);
    }
  };

  const saveInlineLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!profileId || !logContent.trim() || savingLog || vaultBusy || sending) {
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
          profileId,
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
      setLogOpen(false);
      setLogTitle("");
      setLogContent("");
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
    }
  ) => {
    const question = questionRaw.trim();
    if (!question || sending || vaultBusy) return;

    setSending(true);
    setError(null);
    setInput("");

    const optimisticId = `local-${Date.now()}`;
    const userContent = options?.userDisplayContent?.trim() ?? question;
    if (!options?.replaceUserMessageId) {
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
      const res = await fetch("/api/documents/vault-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          chatId: activeChatId,
          ...(requestedWorkProjectId
            ? { workProjectId: requestedWorkProjectId }
            : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        messages?: VaultMessage[];
        chatId?: string;
        chats?: ChatSummary[];
      };
      if (!res.ok) {
        if (options?.replaceUserMessageId) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== options.replaceUserMessageId)
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        setInput(question);
        setError(
          body.error ?? "I couldn't complete that request right now. Please try again.",
          body.code
        );
        return;
      }
      if (body.chats) setChats(body.chats);
      if (body.chatId) setActiveChatId(body.chatId);
      const turn = body.messages ?? [];
      const optimisticAttachment = options?.attachment;
      const mergedTurn = turn.map((m, index) => {
        if (
          index === 0 &&
          m.role === "user" &&
          optimisticAttachment &&
          !m.attachment
        ) {
          return {
            ...m,
            attachment: optimisticAttachment,
            content: userContent || m.content,
          };
        }
        return m;
      });
      setMessages((prev) => [
        ...prev.filter(
          (m) =>
            m.id !== optimisticId && m.id !== options?.replaceUserMessageId
        ),
        ...mergedTurn,
      ]);
      dispatchAwardsFromResponse(body);
      void loadMetaAndChats();
    } catch {
      if (options?.replaceUserMessageId) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== options.replaceUserMessageId)
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      setInput(question);
      setError("I couldn't complete that request right now. Please try again.");
    } finally {
      setSending(false);
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
    if ((!question && !attachment) || sending || vaultBusy) return;

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

        if (!result.analyzed) {
          pushLocalNote(
            `I added "${result.fileName}" to your vault, but analysis didn't finish${
              result.analysisError ? `: ${result.analysisError}` : "."
            }`
          );
          return;
        }

        const finalQuestion =
          question ||
          (isImageUpload(file)
            ? "What do you see in this image? Transcribe any lists or notes clearly."
            : `Summarize what matters in ${result.fileName}.`);
        await sendQuestion(finalQuestion, {
          attachment: {
            documentId: result.documentId,
            fileName: result.fileName,
            kind: isImageUpload(file) ? "image" : "document",
            previewUrl: attachmentPreview,
          },
          userDisplayContent: question,
          replaceUserMessageId: userMsgId,
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

  const renderAssistantContent = (
    m: VaultMessage,
    options?: { hideCitationPreviews?: boolean }
  ) => {
    const proposed = parseProposedReminder(m.content);
    const displayContent = stripProposedReminderSection(m.content);
    const sections = parseGideonSections(
      displayContent || (proposed ? "" : m.content)
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
    const sourceCitations = uniqueCitations.filter(
      (c) => !(c.isImage || isImageFileName(c.fileName))
    );
    const previewCitations = options?.hideCitationPreviews
      ? []
      : [...imageCitations, ...sourceCitations];
    const linkOnlyCitations = options?.hideCitationPreviews ? [] : sourceCitations;
    const alreadySet = confirmedReminderIds.has(m.id);
    const confirming = confirmingReminderId === m.id;

    return (
      <div className="min-w-0 flex-1 space-y-2">
        {previewCitations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {previewCitations.map((c) => (
              <VaultAttachmentCard
                key={`att-${c.documentId}`}
                documentId={c.documentId}
                fileName={c.fileName}
                kind={
                  c.isImage || isImageFileName(c.fileName) ? "image" : "document"
                }
              />
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
        {proposed ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">
              Proposed reminder
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {proposed.title}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {proposedReminderWhenLabel(proposed)}
            </p>
            {alreadySet ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Reminder saved. You decide what happens next.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={confirming || savingReminder || sending || vaultBusy}
                  onClick={() => void confirmProposedReminder(m.id, proposed)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
                >
                  {confirming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  Create reminder
                </button>
                <button
                  type="button"
                  disabled={confirming || savingReminder}
                  onClick={() => {
                    setReminderTitle(proposed.title);
                    setReminderDate(proposed.date);
                    setReminderTime(proposed.time);
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
                      ? `${c.profileName} · ${c.fileName}`
                      : c.fileName}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void viewSource(c.documentId, c.fileName)}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 font-semibold text-brand transition hover:bg-stone-50"
                >
                  View source
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const welcome = !loadingHistory && messages.length === 0 && !sending;
  const onlyDefaultVault =
    !profilesLoading && topLevelProfiles(profiles).length <= 1;
  const docCount = meta?.documentCount ?? 0;
  const photoCount = meta?.photoCount ?? 0;
  const logCount = meta?.logCount ?? 0;
  const fileCount = docCount + photoCount;
  const emptyVault = fileCount === 0 && logCount === 0;
  const logsOnly = fileCount === 0 && logCount > 0;
  const greetName = meta?.firstName;

  const countBits: string[] = [];
  if (docCount > 0) {
    countBits.push(`${docCount} document${docCount === 1 ? "" : "s"}`);
  }
  if (photoCount > 0) {
    countBits.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
  }
  if (logCount > 0) {
    countBits.push(`${logCount} Daily Log${logCount === 1 ? "" : "s"}`);
  }

  const templateBadge =
    meta?.guidance?.badge ?? meta?.templateBadge ?? null;

  const runFirstMemoryAction = (id: FirstMemoryActionId) => {
    if (id === "document") openFilePicker();
    else if (id === "daily_log" || id === "meeting_notes") openLogForm();
    else if (id === "photo") openCamera();
    else if (id === "schedule") openReminderForm();
  };

  const welcomeBlock = welcome && (
    <div className="mx-auto max-w-xl space-y-4 px-1 py-6">
      <div className="flex items-start gap-3">
        <GideonAvatar size={44} />
        <div className="min-w-0 space-y-3">
          <p className="text-base font-semibold text-foreground">
            Hi{greetName ? ` ${greetName}` : ""}, I&apos;m Gideon.
          </p>
          {meta?.profileName && (
            <AskWelcomeProfileSwitch fallbackName={meta.profileName} />
          )}

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {emptyVault
                  ? (meta?.guidance?.headline ?? WELCOME_AI_MEMORY_TITLE)
                  : (meta?.guidance?.headline ?? "Welcome to your vault")}
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
          </div>

          {!emptyVault && countBits.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">
                In this vault: {countBits.join(" · ")}
              </p>
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
                  Open Docs
                </Link>{" "}
                to see everything.
              </p>
            </div>
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

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  {FIRST_MEMORY_PROMPT}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FIRST_MEMORY_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={vaultBusy || sending || !profileId}
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

              <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-xs font-semibold text-foreground">
                  {TRY_GUARDIAN_TITLE}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {TRY_GUARDIAN_SUBTITLE}
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {TRY_GUARDIAN_EXAMPLES.map((example) => (
                    <li
                      key={example}
                      className="text-xs leading-relaxed text-ink-muted"
                    >
                      • {example}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-brand/20 bg-brand-light/40 px-3 py-3">
                <p className="text-xs font-semibold text-foreground">
                  {PRIVACY_CARD_TITLE}
                </p>
                <ul className="mt-2 space-y-1">
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
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                {logsOnly
                  ? "I'll check this profile's Daily Logs first. For other questions I can use general knowledge and clearly say when it's not from your vault."
                  : "I'll search your vault first. If something isn't there, I can answer with general knowledge and label it clearly. What would you like to know?"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openCamera}
                  className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  📷 Scan
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openFilePicker}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  📄 Add files or photos
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openLogForm}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  📝 Add Daily Log
                </button>
              </div>
            </>
          )}

          {meta && meta.suggestions.length > 0 ? (
            <div className="space-y-2 pt-0.5">
              <p className="text-xs font-semibold text-foreground">
                Try asking Gideon
              </p>
              <div className="flex flex-wrap gap-2">
                {meta.suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendQuestion(q)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {onlyDefaultVault ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-3">
              <p className="text-xs font-semibold text-foreground">
                Create another Vault
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
        </div>
      </div>
    </div>
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
      onSidebarAction={() => setSidebarOpen(false)}
    />
  );

  const messageList = (
    <div
      className={
        isPage
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
          {welcomeBlock}
          {messages.map((m, index) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="flex max-w-[85%] flex-col items-end gap-2">
                  {m.attachment ? (
                    <VaultAttachmentCard
                      documentId={m.attachment.documentId}
                      fileName={m.attachment.fileName}
                      kind={m.attachment.kind}
                      previewUrl={m.attachment.previewUrl}
                    />
                  ) : null}
                  {m.content.trim() ? (
                    <div className="rounded-2xl bg-stone-100 px-3.5 py-2 text-sm text-foreground">
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <GideonAvatar size={40} variant="portrait" />
                {renderAssistantContent(m, {
                  hideCitationPreviews:
                    index > 0 &&
                    messages[index - 1]?.role === "user" &&
                    Boolean(messages[index - 1]?.attachment) &&
                    (m.citations ?? []).some(
                      (c) =>
                        c.documentId === messages[index - 1]?.attachment?.documentId
                    ),
                })}
              </div>
            )
          )}
          {(sending || vaultBusy || savingLog) && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <GideonAvatar size={40} variant="portrait" pulse />
              {savingLog
                ? "Saving to your vault…"
                : vaultBusy && vaultStatus
                  ? vaultStatus
                  : loadingLabel}
            </div>
          )}
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

  const contextStrip =
    meta?.chatContextLabel || meta?.templateLabel ? (
      <div
        className={
          isPage
            ? "shrink-0 border-t border-stone-100 px-4 pt-2 sm:px-8"
            : "mt-2 px-0.5"
        }
      >
        <div className={isPage ? "mx-auto max-w-3xl" : undefined}>
          <p className="text-[11px] font-medium text-foreground">
            {meta.chatContextLabel ??
              `You are chatting with Gideon ${meta.templateLabel}`}
          </p>
          <p className="text-[11px] text-ink-muted">
            {meta.vaultScopeNote ?? VAULT_SCOPE_NOTE}
          </p>
        </div>
      </div>
    ) : null;

  const composer = (
    <form
      onSubmit={send}
      className={
        isPage
          ? "shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-8"
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
            <input
              id={inputId}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || vaultBusy || voiceListening}
              maxLength={2000}
              placeholder={
                voiceListening
                  ? "Listening…"
                  : pendingAttachment
                    ? "Write a message…"
                    : emptyVault
                      ? "Ask anything — or use + to scan / upload…"
                      : logsOnly
                        ? "Ask about Daily Logs or anything else…"
                        : "Ask about your documents or anything else…"
              }
              className="w-full border-0 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-muted disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div className="relative shrink-0" ref={plusRef}>
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                aria-expanded={plusOpen}
                aria-haspopup="menu"
                aria-label="Add to vault"
                disabled={vaultBusy || sending || !profileId}
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
                    disabled={vaultBusy || sending || !profileId}
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
                    disabled={vaultBusy || sending || !profileId}
                    onClick={openCamera}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4 text-brand" />
                    Scan with camera
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId}
                    onClick={openLogForm}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <NotebookPen className="h-4 w-4 text-brand" />
                    Add daily log
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={vaultBusy || sending || !profileId}
                    onClick={openReminderForm}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <Bell className="h-4 w-4 text-brand" />
                    Add reminder
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
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
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) stageVaultFile(file);
          }}
        />
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
                onClick={() => setLogOpen(false)}
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
              maxLength={8000}
              placeholder="What happened today?"
              className="mt-3 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLogOpen(false)}
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
                  {active?.display_name ?? meta?.profileName ?? "this space"}{" "}
                  (Eastern Time). Shows under Attention on the dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderOpen(false)}
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

  if (!isPage) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GideonAvatar size={28} />
            <div>
              <h2 className="text-base font-semibold">Ask Gideon</h2>
              <p className="text-[11px] text-ink-muted">
                Your AI guide to everything in your vault.
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
        {contextStrip}
        {composer}
        {vaultOverlays}
      </div>
    );
  }

  return (
    <>
    <div className="flex h-full w-full overflow-hidden bg-white">
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-50 md:flex">
        {askSidebar}
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
            aria-label="Open vaults and chats"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <GideonAvatar size={32} className="hidden sm:inline-flex" />
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
              {meta?.chatContextLabel ??
                meta?.askContextLabel ??
                "Your AI guide to everything in your vault."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href={docsHref}
              aria-label="Documents"
              title="Documents"
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
            >
              <span className="text-ink-muted" aria-hidden>
                ←
              </span>
              Docs
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

        {whyOpen && (
          <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-8">
            <p className="whitespace-pre-wrap">{GIDEON_WHY}</p>
            <p className="mt-2 font-medium text-foreground">{GIDEON_BRAND_LINE}</p>
          </div>
        )}

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
        {contextStrip}
        {composer}
      </div>
    </div>
    {vaultOverlays}
    </>
  );
}
