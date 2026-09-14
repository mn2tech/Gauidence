export const VAULT_CHAT_STREAM_CONTENT_TYPE = "application/x-ndjson";

import type { ActionEventPhase } from "@/lib/actions/client";

export type VaultChatCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  isImage?: boolean;
  /** Vault document (default) or connected-source file from ontology. */
  kind?: "vault" | "connector";
  /** connected_sources.id when kind=connector */
  sourceId?: string;
  /** source_items.id when kind=connector */
  itemId?: string;
  /** android_storage | trello | … */
  sourceType?: string;
  mimeType?: string | null;
  /** Trello card title when the file is a chart attachment */
  cardName?: string | null;
};

export type VaultChatStreamMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: VaultChatCitation[];
  /** Contextual follow-up chips for this assistant turn. */
  suggestedQuestions?: string[];
  attachment?: {
    documentId: string;
    fileName: string;
    kind: "image" | "document";
    mimeType?: string | null;
    previewUrl?: string | null;
  } | null;
  attachments?: Array<{
    documentId: string;
    fileName: string;
    kind: "image" | "document";
    mimeType?: string | null;
    previewUrl?: string | null;
  }>;
  vaultScope?: {
    profileId: string;
    profileName: string;
    activeProfileName: string;
  } | null;
  created_at: string;
};

export type VaultChatStreamChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
};

export type ActionTimelineItem = {
  id: string;
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  message: string | null;
  createdAt: string;
};

export type VaultChatStreamDone = {
  type: "done";
  chatId: string;
  chats: VaultChatStreamChatSummary[];
  messages: VaultChatStreamMessage[];
  proposedReminder?: unknown;
  newlyGranted?: unknown;
  vaultScope?: VaultChatStreamMessage["vaultScope"];
  writeProfile?: { profileId: string; profileName: string };
  chatScopedProfile?: { profileId: string; profileName: string } | null;
  actionTimeline?: ActionTimelineItem[];
};

export type VaultChatStreamEvent =
  | {
      type: "meta";
      chatId: string;
      userMsg: VaultChatStreamMessage;
      thinkingSteps?: string[];
    }
  | { type: "thinking"; steps: string[]; activeIndex: number }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | VaultChatStreamDone
  | { type: "error"; error: string; code?: string };

export function isVaultChatStreamResponse(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes(VAULT_CHAT_STREAM_CONTENT_TYPE);
}

export const DEFAULT_VAULT_CHAT_STREAM_IDLE_TIMEOUT_MS = 45_000;

export type VaultChatStreamOptions = {
  /** Maximum time to wait between stream events before offering a retry. */
  idleTimeoutMs?: number;
};

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("vault_chat_stream_timeout")),
          idleTimeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function parseStreamLine(line: string): VaultChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as VaultChatStreamEvent;
  } catch {
    return null;
  }
}

/** Consume an NDJSON vault-chat stream from fetch. */
export async function consumeVaultChatStream(
  response: Response,
  handlers: {
    onMeta?: (event: Extract<VaultChatStreamEvent, { type: "meta" }>) => void;
    onThinking?: (
      event: Extract<VaultChatStreamEvent, { type: "thinking" }>
    ) => void;
    onDelta?: (text: string) => void;
    /** Replace the full assistant draft (e.g. after Daily Log proposal repair). */
    onReplace?: (text: string) => void;
    onDone?: (event: VaultChatStreamDone) => void;
    onError?: (error: string, code?: string) => void;
  },
  options: VaultChatStreamOptions = {}
): Promise<VaultChatStreamDone | null> {
  if (!response.body) {
    handlers.onError?.("Empty response body.");
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: VaultChatStreamDone | null = null;
  const idleTimeoutMs =
    options.idleTimeoutMs ?? DEFAULT_VAULT_CHAT_STREAM_IDLE_TIMEOUT_MS;

  try {
    while (true) {
      const { done, value } = await readStreamChunk(reader, idleTimeoutMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamLine(line);
        if (!event) continue;
        if (event.type === "meta") {
          handlers.onMeta?.(event);
        } else if (event.type === "thinking") {
          handlers.onThinking?.(event);
        } else if (event.type === "delta") {
          handlers.onDelta?.(event.text);
        } else if (event.type === "replace") {
          handlers.onReplace?.(event.text);
        } else if (event.type === "done") {
          doneEvent = event;
          handlers.onDone?.(event);
        } else if (event.type === "error") {
          handlers.onError?.(event.error, event.code);
          return null;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "vault_chat_stream_timeout") {
      await reader.cancel().catch(() => undefined);
      handlers.onError?.(
        "Gideon is taking longer than expected. Your question is ready to try again.",
        "stream_timeout"
      );
      return null;
    }
    throw error;
  }

  if (buffer.trim()) {
    const event = parseStreamLine(buffer);
    if (event?.type === "done") {
      doneEvent = event;
      handlers.onDone?.(event);
    } else if (event?.type === "error") {
      handlers.onError?.(event.error, event.code);
      return null;
    }
  }

  if (!doneEvent) {
    handlers.onError?.(
      "Gideon's response ended before the answer arrived. Your question is ready to try again.",
      "stream_incomplete"
    );
  }

  return doneEvent;
}
