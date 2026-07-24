import "server-only";

import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { sanitizeGeneratedChatTitle } from "./vaultChatTitle";

export type GenerateVaultChatTitleArgs = {
  question: string;
  answer: string;
  attachmentFileName?: string | null;
};

/**
 * Short Haiku title for a new vault chat thread (3–6 words).
 */
export async function generateVaultChatTitle(
  args: GenerateVaultChatTitleArgs
): Promise<string | null> {
  const client = createLlmClient();
  const attachmentNote = args.attachmentFileName?.trim()
    ? `\nAttached file: ${args.attachmentFileName.trim()}`
    : "";

  const raw = await runChatCompletion(client, {
    system: `You name chat conversations in a document vault app.
Reply with ONLY a short title (3–6 words). No quotes, no trailing punctuation, no markdown.`,
    model: CHAT_MODEL,
    maxTokens: 24,
    messages: [
      {
        role: "user",
        content: `Name this chat.${attachmentNote}

User: ${args.question.slice(0, 500)}

Assistant: ${args.answer.slice(0, 900)}`,
      },
    ],
  });

  return sanitizeGeneratedChatTitle(raw);
}
