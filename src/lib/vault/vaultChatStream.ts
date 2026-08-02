export const VAULT_CHAT_STREAM_CONTENT_TYPE = "application/x-ndjson";

import type { ActionEventPhase } from "@/lib/actions/client";

export type VaultChatCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  isImage?: boolean;
};

export type VaultChatStreamMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: VaultChatCitation[];
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
  | VaultChatStreamDone
  | { type: "error"; error: string; code?: string };

export function isVaultChatStreamResponse(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes(VAULT_CHAT_STREAM_CONTENT_TYPE);
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
    onDone?: (event: VaultChatStreamDone) => void;
    onError?: (error: string, code?: string) => void;
  }
): Promise<VaultChatStreamDone | null> {
  if (!response.body) {
    handlers.onError?.("Empty response body.");
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: VaultChatStreamDone | null = null;

  while (true) {
    const { done, value } = await reader.read();
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
      } else if (event.type === "done") {
        doneEvent = event;
        handlers.onDone?.(event);
      } else if (event.type === "error") {
        handlers.onError?.(event.error, event.code);
        return null;
      }
    }
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

  return doneEvent;
}
