"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type Citation = {
  topicId: string;
  title: string;
  summary: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type Props = {
  userExpertId: string;
  starterQuestions: string[];
  currentModuleId?: string;
};

export default function ExpertChat({
  userExpertId,
  starterQuestions,
  currentModuleId,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    try {
      const res = await fetch("/api/experts/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_expert_id: userExpertId,
          question: trimmed,
          current_module_id: currentModuleId,
          conversation_id: conversationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't get an answer.");
      }
      if (!conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get an answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {starterQuestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {starterQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void sendQuestion(question)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-ink-muted hover:text-foreground"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-[320px] space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Ask a question to get guidance grounded in this expert&apos;s knowledge topics.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "ml-8 bg-brand text-white"
                  : "mr-8 bg-stone-50 text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-3 border-t border-stone-200 pt-3 text-xs text-ink-muted">
                  <p className="font-medium text-foreground">Citations</p>
                  <ul className="mt-1 space-y-1">
                    {message.citations.map((citation) => (
                      <li key={citation.topicId}>
                        {citation.title}: {citation.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuestion(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask this expert a question"
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
