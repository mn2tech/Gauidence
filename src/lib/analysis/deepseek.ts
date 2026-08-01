import "server-only";

import OpenAI from "openai";
import { AnalysisLlmError } from "@/lib/analysis/llmErrors";
import { captureOpenAiCompatibleUsage } from "@/lib/usage/record";

export const DEEPSEEK_CHAT_MODEL =
  process.env.DEEPSEEK_CHAT_MODEL?.trim() || "deepseek-v4-flash";

const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1";

/** DeepSeek rejects very large prompts; cap system context for backup chat. */
const DEEPSEEK_SYSTEM_MAX_CHARS = 120_000;

export { isDeepSeekConfigured } from "@/lib/analysis/chatProvider";

const FALLBACK_ERROR_CODES = new Set([
  "rate_limit",
  "overloaded",
  "api_error",
  "auth",
  "unknown",
]);

export function shouldFallbackToDeepSeek(err: unknown): boolean {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) return false;
  if (!(err instanceof AnalysisLlmError)) return false;
  return FALLBACK_ERROR_CODES.has(err.code);
}

function createDeepSeekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new AnalysisLlmError(
      "DeepSeek fallback isn't configured. Add DEEPSEEK_API_KEY on this deployment.",
      503,
      "missing_api_key"
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    maxRetries: 3,
    timeout: 120_000,
  });
}

function mapDeepSeekError(err: unknown): never {
  if (err instanceof AnalysisLlmError) throw err;
  if (err instanceof OpenAI.APIError) {
    const detail = (err.message || "").trim().slice(0, 240);
    console.error("DeepSeek chat request failed", {
      status: err.status,
      message: detail,
    });
    if (err.status === 401 || err.status === 403) {
      throw new AnalysisLlmError(
        "DeepSeek rejected the API key. Check DEEPSEEK_API_KEY in Vercel.",
        502,
        "auth"
      );
    }
    if (err.status === 402 || /insufficient balance/i.test(detail)) {
      throw new AnalysisLlmError(
        "DeepSeek account has insufficient balance. Add credits at platform.deepseek.com.",
        402,
        "insufficient_balance"
      );
    }
    if (err.status === 429) {
      throw new AnalysisLlmError(
        "AI rate limit reached on both Claude and DeepSeek. Please try again in a minute.",
        429,
        "rate_limit"
      );
    }
    if (err.status === 500 || err.status === 503 || err.status === 529) {
      throw new AnalysisLlmError(
        "The backup AI service is temporarily busy. Please try again in a moment.",
        503,
        "overloaded"
      );
    }
    if (detail) {
      throw new AnalysisLlmError(
        `DeepSeek could not complete this request (${err.status ?? "error"}): ${detail}`,
        err.status ?? 502,
        "api_error"
      );
    }
    throw new AnalysisLlmError(
      "The backup AI service couldn't complete this request. Please try again.",
      502,
      "api_error"
    );
  }
  if (err instanceof Error && err.message.trim()) {
    throw new AnalysisLlmError(err.message.trim(), 502, "unknown");
  }
  throw new AnalysisLlmError(
    "The backup AI service couldn't complete this request. Please try again.",
    502,
    "unknown"
  );
}

type ChatArgs = {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  attachedImage?: { mimeType: string; base64: string; fileName: string };
};

function buildOpenAiMessages(args: ChatArgs): OpenAI.Chat.ChatCompletionMessageParam[] {
  const system =
    args.system.length > DEEPSEEK_SYSTEM_MAX_CHARS
      ? `${args.system.slice(0, DEEPSEEK_SYSTEM_MAX_CHARS)}\n\n[Context truncated for backup AI.]`
      : args.system;

  const rows: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ];

  for (let i = 0; i < args.messages.length; i++) {
    const m = args.messages[i]!;
    const isLastUser = m.role === "user" && i === args.messages.length - 1;
    if (
      isLastUser &&
      args.attachedImage &&
      args.attachedImage.base64.trim()
    ) {
      rows.push({
        role: "user",
        content: `${m.content}\n\n[Attached file: ${args.attachedImage.fileName}. Image preview is unavailable in backup mode — use the document text if provided.]`,
      });
      continue;
    }
    rows.push({ role: m.role, content: m.content });
  }

  return rows;
}

function recordDeepSeekUsage(
  model: string,
  usage: OpenAI.Completions.CompletionUsage | undefined
): void {
  captureOpenAiCompatibleUsage(model, usage, "deepseek");
}

function deepSeekRequestBase(
  args: ChatArgs
): Omit<OpenAI.Chat.ChatCompletionCreateParams, "stream"> {
  return {
    model: DEEPSEEK_CHAT_MODEL,
    messages: buildOpenAiMessages(args),
    max_tokens: args.maxTokens ?? 2048,
    temperature: 0,
  };
}

/** DeepSeek chat completion (OpenAI-compatible API). */
export async function runDeepSeekChatCompletion(args: ChatArgs): Promise<string> {
  try {
    const client = createDeepSeekClient();
    const response = await client.chat.completions.create({
      ...deepSeekRequestBase(args),
      stream: false,
    });
    recordDeepSeekUsage(DEEPSEEK_CHAT_MODEL, response.usage);
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    mapDeepSeekError(err);
  }
}

/** Streaming DeepSeek chat completion. */
export async function runDeepSeekChatCompletionStream(
  args: ChatArgs & { onDelta: (text: string) => void }
): Promise<string> {
  try {
    const client = createDeepSeekClient();
    const stream = await client.chat.completions.create({
      ...deepSeekRequestBase(args),
      stream: true,
    });

    let answer = "";
    let usage: OpenAI.Completions.CompletionUsage | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        answer += delta;
        args.onDelta(delta);
      }
      if (chunk.usage) usage = chunk.usage;
    }

    recordDeepSeekUsage(DEEPSEEK_CHAT_MODEL, usage);
    return answer.trim();
  } catch (err) {
    mapDeepSeekError(err);
  }
}
