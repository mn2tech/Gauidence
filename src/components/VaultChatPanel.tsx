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
  Info,
  Loader2,
  Menu,
  MessageSquarePlus,
  Mic,
  NotebookPen,
  Plus,
  Send,
  Trash2,
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
  GIDEON_BRAND_LINE,
  GIDEON_LOADING_STATES,
  GIDEON_WHY,
  parseGideonSections,
} from "@/lib/vault/gideon";
import { isImageFileName } from "@/lib/vault/images";
import { renderGideonText } from "@/components/gideonText";
import { uploadAndAnalyzeToVault } from "@/lib/vault/clientUpload";
import OrganizationSuggestionModal from "@/components/OrganizationSuggestionModal";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";
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

function CitationImagePreview({
  documentId,
  fileName,
  profileName,
}: {
  documentId: string;
  fileName: string;
  profileName?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { data: doc } = await supabase
        .from("documents")
        .select("file_path")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc?.file_path) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 300);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setFailed(true);
        return;
      }
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (failed) {
    return (
      <p className="text-[11px] text-ink-muted">
        Couldn&apos;t load preview for {fileName}.
      </p>
    );
  }
  if (!url) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-xs text-ink-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading image…
      </div>
    );
  }

  const label = profileName ? `${profileName} · ${fileName}` : fileName;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-xl border border-stone-200 bg-stone-50"
    >
      {/* Signed storage URLs are dynamic; use native img. */}
      <img
        src={url}
        alt={label}
        className="max-h-72 w-full object-contain"
      />
      <p className="truncate border-t border-stone-100 px-2 py-1.5 text-[11px] text-ink-muted">
        {label}
      </p>
    </a>
  );
}

type VaultMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  created_at: string;
};

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
  const { active, profiles, loading: profilesLoading, switchProfile } =
    useActiveProfile();
  const needsSetup = !profilesLoading && profiles.length === 0;
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
  const [orgSuggestion, setOrgSuggestion] =
    useState<OrganizationSuggestionPayload | null>(null);
  const [workProject, setWorkProject] = useState<WorkProject | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const documentsHref = profileId
    ? `/dashboard#documents-${profileId}`
    : "/dashboard";

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

  const handleVaultFile = async (file: File) => {
    if (!profileId || vaultBusy || sending) return;
    setPlusOpen(false);
    setCameraOpen(false);
    setError(null);
    setVaultBusy(true);
    setVaultStatus("Uploading to your vault…");

    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Sign-in isn't available. Refresh and try again.");
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
      setVaultBusy(false);
      setVaultStatus(null);

      if (!result.analyzed) {
        pushLocalNote(
          `I added "${result.fileName}" to your vault, but analysis didn't finish${
            result.analysisError ? `: ${result.analysisError}` : "."
          }`
        );
        return;
      }

      if (
        result.organizationSuggestion &&
        (result.organizationSuggestion.status === "pending" ||
          result.organizationAutoApplied)
      ) {
        setOrgSuggestion({
          ...result.organizationSuggestion,
          autoApplied: Boolean(result.organizationAutoApplied),
        });
      }

      await sendQuestion(
        `I just uploaded ${result.fileName}. What should I know from it?`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
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

  const sendQuestion = async (questionRaw: string) => {
    const question = questionRaw.trim();
    if (!question || sending || vaultBusy) return;

    setSending(true);
    setError(null);
    setInput("");

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "user",
        content: question,
        created_at: new Date().toISOString(),
      },
    ]);

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
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
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
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        ...turn,
      ]);
      dispatchAwardsFromResponse(body);
      void loadMetaAndChats();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
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
    await sendQuestion(input);
  };

  const renderAssistantContent = (m: VaultMessage) => {
    const proposed = parseProposedReminder(m.content);
    const displayContent = stripProposedReminderSection(m.content);
    const sections = parseGideonSections(
      displayContent || (proposed ? "" : m.content)
    );
    const citations = Array.isArray(m.citations) ? m.citations : [];
    const uniqueCitations = [
      ...new Map(citations.map((c) => [c.documentId, c])).values(),
    ];
    const alreadySet = confirmedReminderIds.has(m.id);
    const confirming = confirmingReminderId === m.id;

    return (
      <div className="min-w-0 flex-1 space-y-2">
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
        {uniqueCitations.length > 0 && (
          <div className="space-y-2 pt-1">
            {uniqueCitations.some(
              (c) => c.isImage || isImageFileName(c.fileName)
            ) ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {uniqueCitations
                  .filter((c) => c.isImage || isImageFileName(c.fileName))
                  .map((c) => (
                    <CitationImagePreview
                      key={`img-${c.documentId}`}
                      documentId={c.documentId}
                      fileName={c.fileName}
                      profileName={c.profileName}
                    />
                  ))}
              </div>
            ) : null}
            {uniqueCitations.map((c) => (
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
        )}
      </div>
    );
  };

  const welcome = !loadingHistory && messages.length === 0 && !sending;
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

  const welcomeBlock = welcome && (
    <div className="mx-auto max-w-xl space-y-4 px-1 py-6">
      <div className="flex items-start gap-3">
        <GideonAvatar size={44} />
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold text-foreground">
            Hi{greetName ? ` ${greetName}` : ""}, I&apos;m Gideon.
          </p>
          {meta?.profileName && (
            <AskWelcomeProfileSwitch fallbackName={meta.profileName} />
          )}
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
                  href={documentsHref}
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
              <p className="text-sm text-ink-muted">
                {meta?.profileName
                  ? `${meta.profileName}'s vault is empty for now.`
                  : "Your vault is empty for now."}
              </p>
              <p className="text-sm leading-relaxed text-ink-muted">
                You can still ask general questions. Scan or upload a document
                here, or add a Daily Log, whenever you want me to remember your
                specific details.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openCamera}
                  className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  Scan with camera
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openFilePicker}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  Upload a Document
                </button>
                <button
                  type="button"
                  disabled={vaultBusy || sending || !profileId}
                  onClick={openLogForm}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                >
                  Add a Daily Log
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                {logsOnly
                  ? "I'll check this profile's Daily Logs first. For other questions I can use general knowledge and clearly say when it's not from your vault."
                  : "I'll search your vault first. If something isn't there, I can answer with general knowledge and label it clearly. What would you like to know?"}
              </p>
              {meta && meta.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const chatList = (
    <>
      <div className="flex items-center gap-2 border-b border-stone-200 p-3">
        <button
          type="button"
          onClick={() => void startNewChat()}
          disabled={sending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Chat history
        </p>
        {chats.length === 0 ? (
          <p className="px-2 py-2 text-xs text-ink-muted">No chats yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-center gap-1 rounded-lg ${
                    c.id === activeChatId ? "bg-white ring-1 ring-stone-200" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void selectChat(c.id)}
                    className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm hover:text-foreground"
                  >
                    {c.title || "New chat"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void deleteChat(c.id, e)}
                    aria-label={`Delete ${c.title}`}
                    className="mr-1 rounded-md p-1.5 text-ink-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-stone-200 p-3">
        <Link
          href={documentsHref}
          className="text-xs font-medium text-ink-muted hover:text-foreground"
        >
          ← Docs
        </Link>
      </div>
    </>
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
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-stone-100 px-3.5 py-2 text-sm text-foreground">
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <GideonAvatar size={40} variant="portrait" />
                {renderAssistantContent(m)}
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

  const composer = (
    <form
      onSubmit={send}
      className={
        isPage
          ? "shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-8"
          : "mt-3 flex gap-2"
      }
    >
      <div
        className={
          isPage
            ? "mx-auto flex w-full max-w-3xl gap-2"
            : "flex w-full gap-2"
        }
      >
        <div className="relative shrink-0" ref={plusRef}>
          <button
            type="button"
            onClick={() => setPlusOpen((o) => !o)}
            aria-expanded={plusOpen}
            aria-haspopup="menu"
            aria-label="Add to vault"
            disabled={vaultBusy || sending || !profileId}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
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
              className="absolute bottom-full left-0 z-20 mb-2 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
            >
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
                onClick={openFilePicker}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
              >
                <FileUp className="h-4 w-4 text-brand" />
                Upload document
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleVaultFile(file);
          }}
        />
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
              : emptyVault
                ? "Ask anything — or use + to scan / upload…"
                : logsOnly
                  ? "Ask about Daily Logs or anything else…"
                  : "Ask about your documents or anything else…"
          }
          className={`min-w-0 flex-1 rounded-full border bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-50 ${
            voiceListening
              ? "border-brand/50 ring-1 ring-brand/30"
              : "border-stone-200"
          }`}
        />
        {voiceSupported ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceListening ? "Stop listening" : "Talk to Gideon"}
            aria-pressed={voiceListening}
            disabled={sending || vaultBusy || !profileId}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
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
          disabled={sending || vaultBusy || !input.trim()}
          aria-label="Send question to Gideon"
          className="inline-flex items-center justify-center rounded-full bg-brand px-3 py-2 text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        >
          {sending || vaultBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );

  const vaultOverlays = (
    <>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void handleVaultFile(file)}
      />
      {orgSuggestion ? (
        <OrganizationSuggestionModal
          suggestion={orgSuggestion}
          onDismiss={() => setOrgSuggestion(null)}
          onChooseLocation={() => setOrgSuggestion(null)}
          onResolved={({ action, movedToProfileId, undoAvailable }) => {
            if (action === "undo" || !undoAvailable) {
              setOrgSuggestion(null);
            }
            if (movedToProfileId && movedToProfileId !== profileId) {
              pushLocalNote(
                "I filed that document in the location you approved. You can find it under Documents in that vault."
              );
            } else if (action === "keep_current") {
              pushLocalNote("Kept the document in this vault.");
            } else if (action === "undo") {
              pushLocalNote("Returned the document to its previous location.");
            }
          }}
        />
      ) : null}
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
    const setupBlock = (
      <div className="mx-auto max-w-md space-y-4 px-1 py-8 text-center">
        <div className="flex justify-center">
          <GideonAvatar size={44} />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Create a space first
        </h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          Gideon looks at your people and spaces. Choose who you&apos;re helping
          on the dashboard, then come back to ask questions.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Set up your first space
        </Link>
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
        {composer}
        {vaultOverlays}
      </div>
    );
  }

  return (
    <>
    <div className="flex h-full w-full overflow-hidden bg-white">
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-50 md:flex">
        {chatList}
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
              <span className="text-sm font-semibold">Chats</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-ink-muted hover:bg-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{chatList}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-stone-100 md:hidden"
            aria-label="Open chat history"
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
              {meta?.askContextLabel ??
                "Your AI guide to everything in your vault."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href={documentsHref}
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
        {composer}
      </div>
    </div>
    {vaultOverlays}
    </>
  );
}
