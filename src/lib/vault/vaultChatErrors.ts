import { AnalysisLlmError } from "@/lib/analysis/llmErrors";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const GENERIC_VAULT_CHAT_ERROR =
  "I couldn't complete that request right now. Please try again.";

/** Shown when the model returns no text (not when facts need verification). */
export const GIDEON_EMPTY_ANSWER_FALLBACK =
  "I couldn't put together an answer just now. Try rephrasing your question, or switch search scope to Everywhere if the information might be in another vault.";

export function formatVaultChatError(err: unknown): {
  error: string;
  code?: string;
  status: number;
} {
  if (err instanceof AnalysisLlmError) {
    return {
      error: err.message,
      code: err.code,
      status: err.status,
    };
  }

  if (err instanceof Anthropic.APIError) {
    const mapped =
      err.status === 429
        ? "Claude rate limit reached. Please try again in a minute."
        : (err.message || "").trim() ||
          "The Claude service couldn't complete this request.";
    return {
      error: mapped,
      code: err.status === 429 ? "rate_limit" : "api_error",
      status: err.status ?? 502,
    };
  }

  if (err instanceof OpenAI.APIError) {
    const mapped =
      err.status === 429
        ? "OpenAI rate limit reached during vault search. Retrying without document search may help."
        : (err.message || "").trim() ||
          "The embedding service couldn't complete this request.";
    return {
      error: mapped,
      code: err.status === 429 ? "rate_limit" : "api_error",
      status: err.status ?? 502,
    };
  }

  if (err instanceof Error && err.message.trim()) {
    return { error: err.message.trim(), status: 502 };
  }

  if (err && typeof err === "object") {
    const status =
      "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 502;
    const message =
      "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message.trim()
        : "";
    const code =
      "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : status === 429
          ? "rate_limit"
          : undefined;

    if (message) {
      return { error: message, code, status };
    }

    return { error: GENERIC_VAULT_CHAT_ERROR, status };
  }

  return { error: GENERIC_VAULT_CHAT_ERROR, status: 502 };
}
