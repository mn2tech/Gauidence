"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Library,
  Menu,
  MessageSquarePlus,
  Send,
  Trash2,
  X,
} from "lucide-react";

type Citation = { documentId: string; fileName: string };

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

type Props = {
  /** embedded = dashboard card; page = full-screen workspace */
  variant?: "embedded" | "page";
};

export default function VaultChatPanel({ variant = "embedded" }: Props) {
  const isPage = variant === "page";
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputId = isPage ? "vault-chat-page-input" : "vault-chat-input";

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/documents/vault-chat");
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      chats?: ChatSummary[];
    };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load chats.");
    setChats(body.chats ?? []);
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
      const list = await loadChats();
      if (list.length > 0) {
        await loadThread(list[0]!.id);
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load vault chat.");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [loadChats, loadThread]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const startNewChat = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/documents/vault-chat", { method: "PUT" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        chat?: ChatSummary;
        chats?: ChatSummary[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create a new chat.");
        return;
      }
      if (body.chats) setChats(body.chats);
      setActiveChatId(body.chat?.id ?? null);
      setMessages([]);
      setSidebarOpen(false);
    } catch {
      setError("Couldn't create a new chat.");
    } finally {
      setSending(false);
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

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
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
        if (next[0]) await loadThread(next[0].id);
        else {
          setActiveChatId(null);
          setMessages([]);
        }
      }
    } catch {
      setError("Couldn't delete chat.");
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
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
        setError(body.error ?? "Couldn't get an answer. Please try again.");
        return;
      }
      if (body.chats) setChats(body.chats);
      if (body.chatId) setActiveChatId(body.chatId);
      const turn = body.messages ?? [];
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        ...turn,
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(question);
      setError("Couldn't reach vault chat. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const sidebar = (
    <aside
      className={
        isPage
          ? "flex h-full w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-50"
          : "hidden"
      }
    >
      <div className="flex items-center gap-2 border-b border-stone-200 p-3">
        <button
          type="button"
          onClick={() => void startNewChat()}
          disabled={sending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
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
    </aside>
  );

  const messageList = (
    <div
      className={
        isPage
          ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-8"
          : "max-h-64 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200"
      }
    >
      {loadingHistory ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading conversation…
        </p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Try “Which invoices are unpaid?” or “What renews in the next 30 days?”
        </p>
      ) : (
        messages.map((m) => (
          <div key={m.id} className="text-sm leading-relaxed">
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {m.role === "user" ? "You" : "Guardian"}
            </span>
            <span
              className={`whitespace-pre-wrap ${
                m.role === "user" ? "text-foreground" : "text-ink-muted"
              }`}
            >
              {m.content}
            </span>
            {m.role === "assistant" &&
              Array.isArray(m.citations) &&
              m.citations.length > 0 && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Sources:{" "}
                  {[
                    ...new Map(
                      m.citations.map((c) => [c.documentId, c.fileName])
                    ).values(),
                  ].join(", ")}
                </p>
              )}
          </div>
        ))
      )}
      {sending && (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching your vault…
        </p>
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
      <div className={isPage ? "mx-auto flex w-full max-w-3xl gap-2" : "contents"}>
        <label className="sr-only" htmlFor={inputId}>
          Ask your vault
        </label>
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={2000}
          placeholder="Ask across your documents…"
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send vault question"
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
            <Library className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold">Ask your vault</h2>
          </div>
          <Link
            href="/dashboard/chat"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark"
          >
            Open full screen
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mb-4 text-xs text-ink-muted">
          Search across your analyzed documents. Use full screen for history and
          new chats.
        </p>
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
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile drawer */}
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
            {sidebar}
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
          <Library className="hidden h-4 w-4 text-brand sm:block" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {chats.find((c) => c.id === activeChatId)?.title ?? "Ask your vault"}
            </h1>
            <p className="truncate text-[11px] text-ink-muted">
              Answers cite your documents · AI can be wrong
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
