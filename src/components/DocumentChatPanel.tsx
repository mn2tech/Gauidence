"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import PlanLimitAlert from "@/components/PlanLimitAlert";

export type DocumentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Props = {
  documentId: string;
  enabled: boolean;
};

export default function DocumentChatPanel({ documentId, enabled }: Props) {
  const [messages, setMessages] = useState<DocumentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setErrorState] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const setError = (message: string | null, code?: string) => {
    if (message === null) setErrorState(null);
    else setErrorState(code ? { message, code } : { message });
  };
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    if (!enabled) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/chat?documentId=${encodeURIComponent(documentId)}`
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: DocumentChatMessage[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load chat history.");
        setMessages([]);
        return;
      }
      setMessages(body.messages ?? []);
    } catch {
      setError("Couldn't load chat history.");
    } finally {
      setLoadingHistory(false);
    }
  }, [documentId, enabled]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending || !enabled) return;

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
      const res = await fetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, question }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        messages?: DocumentChatMessage[];
      };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(question);
        setError(body.error ?? "Couldn't get an answer. Please try again.", body.code);
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
      setError("Couldn't reach the chat service. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="mt-4 border-t border-stone-200 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold">Ask about this document</h3>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Answers use this document&apos;s analysis only. AI can be wrong — verify
        important details.
      </p>

      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg bg-white p-3 ring-1 ring-stone-200">
        {loadingHistory ? (
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Try asking for the invoice number, due date, or total amount.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm leading-relaxed ${
                m.role === "user" ? "text-foreground" : "text-ink-muted"
              }`}
            >
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {m.role === "user" ? "You" : "Guardian"}
              </span>
              <span className="whitespace-pre-wrap">{m.content}</span>
            </div>
          ))
        )}
        {sending && (
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <PlanLimitAlert
          message={error.message}
          code={error.code}
          className="mt-2 text-xs text-red-700"
        />
      )}

      <form onSubmit={send} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={`doc-chat-${documentId}`}>
          Ask a question
        </label>
        <input
          id={`doc-chat-${documentId}`}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={2000}
          placeholder="Ask a question…"
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send question"
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
