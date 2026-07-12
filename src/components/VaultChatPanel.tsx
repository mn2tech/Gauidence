"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Library, Send } from "lucide-react";

type Citation = { documentId: string; fileName: string };

type VaultMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  created_at: string;
};

type Props = {
  /** embedded = dashboard card; page = full /dashboard/chat tab */
  variant?: "embedded" | "page";
};

export default function VaultChatPanel({ variant = "embedded" }: Props) {
  const isPage = variant === "page";
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputId = isPage ? "vault-chat-page-input" : "vault-chat-input";

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/vault-chat");
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: VaultMessage[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load vault chat.");
        setMessages([]);
        return;
      }
      setMessages(body.messages ?? []);
    } catch {
      setError("Couldn't load vault chat.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
        body: JSON.stringify({ question }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: VaultMessage[];
      };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(question);
        setError(body.error ?? "Couldn't get an answer. Please try again.");
        return;
      }
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

  return (
    <div
      className={
        isPage
          ? "flex min-h-[70vh] flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
          : "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-brand" />
          <h2 className={isPage ? "text-lg font-semibold" : "text-base font-semibold"}>
            Ask your vault
          </h2>
        </div>
        {!isPage && (
          <Link
            href="/dashboard/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Open in new tab
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Search across your analyzed documents only. Answers cite source files.
        AI can be wrong — verify important details.
      </p>

      <div
        className={
          isPage
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200"
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
            Try “Which invoices are unpaid?” or “What renews in the next 30
            days?”
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

      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={send} className="mt-3 flex gap-2">
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
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-50"
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
      </form>
    </div>
  );
}
