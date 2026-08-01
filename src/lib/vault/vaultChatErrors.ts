import { AnalysisLlmError } from "@/lib/analysis/llmErrors";

const GENERIC_VAULT_CHAT_ERROR =
  "I couldn't complete that request right now. Please try again.";

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
