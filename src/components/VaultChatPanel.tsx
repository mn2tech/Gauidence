"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileUp,
  Camera,
  Info,
  Loader2,
  Menu,
  MessageSquarePlus,
  NotebookPen,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GideonAvatar from "@/components/GideonAvatar";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  GIDEON_BRAND_LINE,
  GIDEON_LOADING_STATES,
  GIDEON_WHY,
  parseGideonSections,
} from "@/lib/vault/gideon";
import { isImageFileName } from "@/lib/vault/images";

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
  logCount?: number;
  suggestions: string[];
  profileId?: string;
  profileName?: string;
  askContextLabel?: string;
};

type Props = {
  variant?: "embedded" | "page";
};

const SECTION_STYLES: Record<string, string> = {
  from_documents: "border-brand/30 bg-brand-light/40",
  from_daily_log: "border-emerald-200 bg-emerald-50/80",
  from_profiles: "border-teal-200 bg-teal-50/80",
  calculated: "border-sky-200 bg-sky-50/80",
  general_knowledge: "border-stone-200 bg-stone-50/90",
  suggestion: "border-violet-200 bg-violet-50/70",
  needs_verification: "border-amber-200 bg-amber-50/80",
  body: "border-transparent bg-transparent",
};

export default function VaultChatPanel({ variant = "embedded" }: Props) {
  const isPage = variant === "page";
  const { active } = useActiveProfile();
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
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const inputId = isPage ? "ask-gideon-page-input" : "ask-gideon-input";
  const profileId = active?.id ?? meta?.profileId ?? null;
  const docsHref = profileId
    ? `/dashboard#documents-${profileId}`
    : "/dashboard";
  const cameraHref = profileId
    ? `/dashboard?camera=1#documents-${profileId}`
    : "/dashboard?camera=1";
  const logHref = profileId
    ? `/dashboard#daily-log-${profileId}`
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
    };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load chat.");
    if (body.chats) setChats(body.chats);
    setActiveChatId(body.chatId ?? chatId);
    setMessages(body.messages ?? []);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const list = await loadMetaAndChats();
      // Fresh landing: show welcome (no auto-open of old thread)
      setActiveChatId(null);
      setMessages([]);
      if (!isPage && list[0]) {
        await loadThread(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load Ask Gideon.");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [isPage, loadMetaAndChats, loadThread]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onProfile = () => {
      setActiveChatId(null);
      setMessages([]);
      void bootstrap();
    };
    window.addEventListener("guardian:profile-changed", onProfile);
    return () =>
      window.removeEventListener("guardian:profile-changed", onProfile);
  }, [bootstrap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!sending) return;
    let i = 0;
    setLoadingLabel(GIDEON_LOADING_STATES[0]);
    const t = window.setInterval(() => {
      i = (i + 1) % GIDEON_LOADING_STATES.length;
      setLoadingLabel(GIDEON_LOADING_STATES[i]!);
    }, 2200);
    return () => window.clearInterval(t);
  }, [sending]);

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

  const sendQuestion = async (questionRaw: string) => {
    const question = questionRaw.trim();
    if (!question || sending) return;

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
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: VaultMessage[];
        chatId?: string;
        chats?: ChatSummary[];
      };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(question);
        setError(
          body.error ?? "I couldn't complete that request right now. Please try again."
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
      void loadMetaAndChats();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(question);
      setError("I couldn't complete that request right now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendQuestion(input);
  };

  const renderAssistantContent = (m: VaultMessage) => {
    const sections = parseGideonSections(m.content);
    const citations = Array.isArray(m.citations) ? m.citations : [];
    const uniqueCitations = [
      ...new Map(citations.map((c) => [c.documentId, c])).values(),
    ];

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
            <p className="whitespace-pre-wrap text-foreground/90">{sec.content}</p>
          </div>
        ))}
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
  const logCount = meta?.logCount ?? 0;
  const emptyVault = docCount === 0 && logCount === 0;
  const logsOnly = docCount === 0 && logCount > 0;
  const greetName = meta?.firstName;

  const welcomeBlock = welcome && (
    <div className="mx-auto max-w-xl space-y-4 px-1 py-6">
      <div className="flex items-start gap-3">
        <GideonAvatar size={44} />
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold text-foreground">
            Hi{greetName ? ` ${greetName}` : ""}, I&apos;m Gideon.
          </p>
          {meta?.profileName && (
            <p className="text-xs font-medium text-ink-muted">
              {meta.askContextLabel ??
                `Looking at ${meta.profileName}'s vault`}
            </p>
          )}
          {emptyVault ? (
            <>
              <p className="text-sm text-ink-muted">
                {meta?.profileName
                  ? `${meta.profileName}'s vault is empty for now.`
                  : "Your vault is empty for now."}
              </p>
              <p className="text-sm leading-relaxed text-ink-muted">
                You can still ask general questions. Upload a document or add a
                Daily Log whenever you want me to remember your specific
                details.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={cameraHref}
                  className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
                >
                  Scan with camera
                </Link>
                <Link
                  href={docsHref}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Upload a Document
                </Link>
                <Link
                  href={logHref}
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50"
                >
                  Add a Daily Log
                </Link>
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
          href="/dashboard"
          className="text-xs font-medium text-ink-muted hover:text-foreground"
        >
          ← Documents
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
          <GideonAvatar size={28} pulse />
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
                <GideonAvatar size={28} />
                {renderAssistantContent(m)}
              </div>
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <GideonAvatar size={28} pulse />
              {loadingLabel}
            </div>
          )}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );

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
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
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
              <Link
                role="menuitem"
                href={cameraHref}
                onClick={() => setPlusOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-50"
              >
                <Camera className="h-4 w-4 text-brand" />
                Scan with camera
              </Link>
              <Link
                role="menuitem"
                href={docsHref}
                onClick={() => setPlusOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-50"
              >
                <FileUp className="h-4 w-4 text-brand" />
                Upload document
              </Link>
              <Link
                role="menuitem"
                href={logHref}
                onClick={() => setPlusOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-50"
              >
                <NotebookPen className="h-4 w-4 text-brand" />
                Add daily log
              </Link>
            </div>
          )}
        </div>
        <label className="sr-only" htmlFor={inputId}>
          Ask Gideon
        </label>
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={2000}
          placeholder={
            emptyVault
              ? "Ask anything — vault answers when you upload…"
              : logsOnly
                ? "Ask about Daily Logs or anything else…"
                : "Ask about your documents or anything else…"
          }
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send question to Gideon"
          className="inline-flex items-center justify-center rounded-full bg-brand px-3 py-2 text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );

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
          <p className="mt-2 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
        {composer}
      </div>
    );
  }

  return (
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
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {chats.find((c) => c.id === activeChatId)?.title ?? "Ask Gideon"}
              </h1>
              <button
                type="button"
                onClick={() => setWhyOpen((o) => !o)}
                aria-label="About Gideon"
                className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="truncate text-[11px] text-ink-muted">
              {meta?.askContextLabel ??
                "Your AI guide to everything in your vault."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void startNewChat()}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-stone-50 md:hidden"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New
          </button>
        </header>

        {whyOpen && (
          <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-8">
            <p className="whitespace-pre-wrap">{GIDEON_WHY}</p>
            <p className="mt-2 font-medium text-foreground">{GIDEON_BRAND_LINE}</p>
          </div>
        )}

        {messageList}

        {error && (
          <p className="shrink-0 px-4 text-xs text-red-700 sm:px-8" role="alert">
            {error}
          </p>
        )}

        {composer}
      </div>
    </div>
  );
}
