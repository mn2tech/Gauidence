"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { extractConversationsJsonFromFile } from "@/lib/chat/import/extractFromFile";
import {
  parseExport,
  toConversationPreviews,
  type ImportedConversation,
  type ImportedConversationPreview,
} from "@/lib/chat/import/parseExport";
import { IMPORT_MAX_CONVERSATIONS } from "@/lib/chat/import/types";

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  imported_from?: "chatgpt" | "claude" | null;
};

type Props = {
  open: boolean;
  profileId: string | null;
  onClose: () => void;
  onImported: (result: {
    chatIds: string[];
    chats: ChatSummary[];
  }) => void;
};

function sourceLabel(source: ImportedConversationPreview["source"]): string {
  return source === "chatgpt" ? "ChatGPT" : "Claude";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function VaultChatImportModal({
  open,
  profileId,
  onClose,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [conversations, setConversations] = useState<ImportedConversation[]>([]);
  const [previews, setPreviews] = useState<ImportedConversationPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<"chatgpt" | "claude" | null>(null);

  const reset = useCallback(() => {
    setParseError(null);
    setImportError(null);
    setParsing(false);
    setImporting(false);
    setConversations([]);
    setPreviews([]);
    setSelected(new Set());
    setSource(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setImportError(null);
    try {
      const json = await extractConversationsJsonFromFile(file);
      const parsed = parseExport(json);
      const limited = parsed.conversations.slice(0, IMPORT_MAX_CONVERSATIONS);
      setConversations(limited);
      setPreviews(toConversationPreviews(limited));
      setSource(parsed.source);
      setSelected(new Set(limited.map((c) => c.externalId)));
    } catch (err) {
      reset();
      setParseError(
        err instanceof Error ? err.message : "Couldn't read this export file."
      );
    } finally {
      setParsing(false);
    }
  }

  function toggleSelected(externalId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === previews.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(previews.map((p) => p.externalId)));
  }

  async function handleImport() {
    if (!profileId || selected.size === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = conversations.filter((c) => selected.has(c.externalId));
      const res = await fetch("/api/documents/vault-chat/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, conversations: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        imported?: number;
        duplicates?: number;
        failed?: number;
        chatIds?: string[];
        chats?: ChatSummary[];
      };
      if (!res.ok) {
        setImportError(body.error ?? "Import failed. Please try again.");
        return;
      }
      onImported({
        chatIds: body.chatIds ?? [],
        chats: body.chats ?? [],
      });
      onClose();
    } catch {
      setImportError("Couldn't reach Guardian. Check your connection.");
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-labelledby="vault-chat-import-title"
    >
      <div className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <h2
              id="vault-chat-import-title"
              className="text-base font-semibold text-foreground"
            >
              Import chat history
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Upload a ChatGPT or Claude data export (.zip or conversations.json).
              Imports are read-only history — Gideon won&apos;t re-run them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-muted hover:bg-stone-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {previews.length === 0 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={parsing || !profileId}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center transition hover:border-brand hover:bg-brand-light/20 disabled:opacity-50"
              >
                {parsing ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand" />
                ) : (
                  <FileUp className="h-8 w-8 text-brand" />
                )}
                <span className="text-sm font-semibold text-foreground">
                  {parsing ? "Reading export…" : "Choose export file"}
                </span>
                <span className="text-xs text-ink-muted">
                  ChatGPT: Settings → Data controls → Export · Claude: Settings →
                  Privacy → Export data
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,.json,application/json,application/zip"
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-ink-muted">
                  {previews.length} conversation{previews.length === 1 ? "" : "s"}{" "}
                  from {source ? sourceLabel(source) : "export"}
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  {selected.size === previews.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <ul className="space-y-1 rounded-xl border border-stone-200">
                {previews.map((preview) => {
                  const checked = selected.has(preview.externalId);
                  return (
                    <li key={preview.externalId}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-stone-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(preview.externalId)}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {preview.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            {preview.messageCount} message
                            {preview.messageCount === 1 ? "" : "s"}
                            {formatDate(preview.updatedAt)
                              ? ` · ${formatDate(preview.updatedAt)}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  reset();
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="text-xs font-medium text-ink-muted hover:text-foreground"
              >
                Choose a different file
              </button>
            </div>
          )}

          {parseError ? (
            <p className="mt-3 text-sm text-red-700">{parseError}</p>
          ) : null}
          {importError ? (
            <p className="mt-3 text-sm text-red-700">{importError}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
          >
            Cancel
          </button>
          {previews.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || selected.size === 0 || !profileId}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${selected.size} chat${selected.size === 1 ? "" : "s"}`
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
