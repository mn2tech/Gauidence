"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Paperclip, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  canEditGuardianProfile,
  canManageProfileAccess,
  type GuardianProfile,
} from "@/lib/profiles/types";
import { emptyConversationSuggestions } from "@/lib/space-conversations/helpers";
import {
  knowledgeKindLabel,
  type SpaceConversationCitation,
  type SpaceConversationMessage,
  type SpaceKnowledgeKind,
} from "@/lib/space-conversations/types";

type Props = {
  profile: GuardianProfile;
  userId: string;
};

type SpaceDoc = { id: string; file_name: string };

function citationHref(
  profileId: string,
  citation: SpaceConversationCitation
): string | null {
  if (citation.kind === "knowledge") {
    return `/dashboard?docs=1&profileId=${encodeURIComponent(profileId)}#decisions-${profileId}`;
  }
  if (!citation.documentId || citation.documentId.startsWith("knowledge:")) {
    return null;
  }
  const q = new URLSearchParams({
    docs: "1",
    profileId,
    documentId: citation.documentId,
  });
  return `/dashboard?${q.toString()}#documents-${profileId}`;
}

export default function SpaceConversationPanel({ profile, userId }: Props) {
  const [messages, setMessages] = useState<SpaceConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [docs, setDocs] = useState<SpaceDoc[]>([]);
  const [attachedDoc, setAttachedDoc] = useState<SpaceDoc | null>(null);
  const [saveMenuFor, setSaveMenuFor] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const canEdit = canEditGuardianProfile(profile, userId);
  const canInvite = canManageProfileAccess(profile);
  const inviteHref = `/settings/profiles/${profile.id}/collaborators`;

  const suggestions = useMemo(
    () => emptyConversationSuggestions(profile.display_name),
    [profile.display_name]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(profile.id)}/conversation`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load conversation.");
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  useEffect(() => {
    if (!attachOpen) return;
    let cancelled = false;
    async function loadDocs() {
      const supabase = createClient();
      if (!supabase) return;
      const { data } = await supabase
        .from("documents")
        .select("id, file_name")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!cancelled) {
        setDocs(
          (data ?? []).map((d) => ({
            id: String(d.id),
            file_name: String(d.file_name),
          }))
        );
      }
    }
    void loadDocs();
    return () => {
      cancelled = true;
    };
  }, [attachOpen, profile.id]);

  async function send(content: string) {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(profile.id)}/conversation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            attachedDocumentId: attachedDoc?.id ?? null,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send.");
      setAttachedDoc(null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.warning) setError(String(data.warning));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function saveAs(messageId: string, kind: SpaceKnowledgeKind) {
    setSavingId(messageId);
    setSaveMenuFor(null);
    try {
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(profile.id)}/knowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, messageId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex min-h-[28rem] flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Discuss this Space with your team, or ask{" "}
        <span className="font-medium text-foreground">@Gideon</span> about the
        knowledge stored here.
      </p>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-8 text-center">
          <h3 className="text-base font-semibold text-foreground">
            Start a conversation
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Discuss this Space with your team or ask Gideon about the knowledge
            stored here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) =>
              s.action === "invite" ? (
                canInvite ? (
                  <Link
                    key={s.id}
                    href={inviteHref}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
                  >
                    {s.label}
                  </Link>
                ) : null
              ) : (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.prompt) void send(s.prompt);
                  }}
                  disabled={sending}
                  className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50"
                >
                  {s.label}
                </button>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto pr-1">
          {messages.map((m) => {
            const isGideon = m.sender_type === "gideon";
            const name = m.sender_display_name ?? (isGideon ? "Gideon" : "Member");
            const citations = m.citations ?? [];
            const followUps = m.suggested_questions ?? [];
            return (
              <article key={m.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4
                    className={`text-sm font-semibold ${
                      isGideon ? "text-brand" : "text-foreground"
                    }`}
                  >
                    {name}
                  </h4>
                  {canEdit ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setSaveMenuFor((cur) => (cur === m.id ? null : m.id))
                        }
                        disabled={savingId === m.id}
                        className="text-xs font-medium text-ink-muted transition hover:text-foreground"
                      >
                        {savingId === m.id ? "Saving…" : "Save as…"}
                      </button>
                      {saveMenuFor === m.id ? (
                        <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-md">
                          {(
                            ["decision", "task", "note"] as SpaceKnowledgeKind[]
                          ).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => void saveAs(m.id, kind)}
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-stone-50"
                            >
                              {knowledgeKindLabel(kind)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {m.content}
                </div>
                {m.attached_file_name ? (
                  <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {m.attached_file_name}
                  </p>
                ) : null}
                {citations.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Sources
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {citations.map((c) => {
                        const href = citationHref(profile.id, c);
                        const label =
                          c.page != null
                            ? `${c.fileName} — Page ${c.page}`
                            : c.fileName;
                        return (
                          <li key={`${c.documentId}-${c.fileName}`}>
                            {href ? (
                              <Link
                                href={href}
                                className="inline-flex rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand"
                              >
                                {label}
                              </Link>
                            ) : (
                              <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-ink-muted">
                                {label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {followUps.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-ink-muted">
                      Possible questions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {followUps.map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={sending}
                          onClick={() => void send(`@Gideon ${q}`)}
                          className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-foreground transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="sticky bottom-0 space-y-2 border-t border-stone-200 bg-white pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        {attachedDoc ? (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{attachedDoc.file_name}</span>
            <button
              type="button"
              className="font-medium text-foreground underline"
              onClick={() => setAttachedDoc(null)}
            >
              Remove
            </button>
          </div>
        ) : null}
        {attachOpen ? (
          <div className="max-h-36 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-2">
            {docs.length === 0 ? (
              <p className="px-2 py-1 text-xs text-ink-muted">
                No files in this Space yet.
              </p>
            ) : (
              docs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setAttachedDoc(d);
                    setAttachOpen(false);
                  }}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-white"
                >
                  {d.file_name}
                </button>
              ))
            )}
          </div>
        ) : null}
        <label className="sr-only" htmlFor={`space-conv-${profile.id}`}>
          Message Gideon or your team
        </label>
        <textarea
          id={`space-conv-${profile.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Message Gideon or your team… Use @Gideon to ask about this Space."
          className="w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-foreground outline-none ring-brand/30 placeholder:text-ink-muted focus:ring-2"
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            Attach
          </button>
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
