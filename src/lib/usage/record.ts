import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createAdminClient } from "@/lib/supabase/admin";

export type LlmUsageFeature =
  | "vault_chat"
  | "document_chat"
  | "analyze"
  | "research"
  | "other";

export type LlmUsageContext = {
  userId: string;
  feature: LlmUsageFeature;
};

const store = new AsyncLocalStorage<LlmUsageContext>();

/** Run Claude calls so token usage is attributed to this user/feature. */
export function withLlmUsage<T>(
  ctx: LlmUsageContext,
  fn: () => Promise<T>
): Promise<T> {
  return store.run(ctx, fn);
}

export function getLlmUsageContext(): LlmUsageContext | undefined {
  return store.getStore();
}

export type RecordLlmUsageArgs = {
  userId: string;
  feature: string;
  provider?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Fire-and-forget insert; never throws into the request path. */
export function recordLlmUsage(args: RecordLlmUsageArgs): void {
  const input = Math.max(0, Math.floor(args.inputTokens));
  const output = Math.max(0, Math.floor(args.outputTokens));
  if (input === 0 && output === 0) return;

  void (async () => {
    try {
      const admin = createAdminClient();
      if (!admin) return;
      const { error } = await admin.from("llm_usage_events").insert({
        user_id: args.userId,
        feature: args.feature.slice(0, 64),
        provider: (args.provider ?? "anthropic").slice(0, 32),
        model: args.model.slice(0, 120),
        input_tokens: input,
        output_tokens: output,
      });
      if (error) {
        console.error("llm_usage_events insert failed:", error.message);
      }
    } catch (err) {
      console.error(
        "llm_usage_events insert error:",
        err instanceof Error ? err.message : "unknown"
      );
    }
  })();
}

/** Capture Anthropic Messages usage when a request context is active. */
export function captureAnthropicUsage(
  model: string,
  usage:
    | { input_tokens?: number; output_tokens?: number }
    | null
    | undefined
): void {
  const ctx = getLlmUsageContext();
  if (!ctx || !usage) return;
  recordLlmUsage({
    userId: ctx.userId,
    feature: ctx.feature,
    provider: "anthropic",
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  });
}
