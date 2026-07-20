import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { estimateClaudeCostUsd } from "./pricing";

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UsageFeatureRow = {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UsageUserRow = {
  userId: string;
  email: string | null;
  calls: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UsageSummary = {
  last7Days: UsageTotals;
  thisMonth: UsageTotals;
  byFeature: UsageFeatureRow[];
  topUsers: UsageUserRow[];
  since: string | null;
  note: string;
};

function monthStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GUARDIAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}-01T00:00:00.000Z`;
}

type EventRow = {
  user_id: string;
  feature: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function eventCost(e: EventRow): number {
  return estimateClaudeCostUsd({
    model: e.model,
    inputTokens: e.input_tokens,
    outputTokens: e.output_tokens,
  });
}

function sumWindow(events: EventRow[], sinceIso: string): UsageTotals {
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCostUsd = 0;
  for (const e of events) {
    if (e.created_at < sinceIso) continue;
    calls += 1;
    inputTokens += e.input_tokens;
    outputTokens += e.output_tokens;
    estimatedCostUsd += eventCost(e);
  }
  return {
    calls,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd,
  };
}

export async function loadUsageSummary(): Promise<UsageSummary | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceMonth = monthStartIso();
  const older = since7d < sinceMonth ? since7d : sinceMonth;

  const { data, error } = await admin
    .from("llm_usage_events")
    .select("user_id, feature, model, input_tokens, output_tokens, created_at")
    .gte("created_at", older)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (error) {
    if (
      error.message?.includes("llm_usage_events") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return {
        last7Days: emptyTotals(),
        thisMonth: emptyTotals(),
        byFeature: [],
        topUsers: [],
        since: null,
        note: "Run migration 0028_llm_usage_events.sql in Supabase, then use Ask Gideon / Analyze so rows appear.",
      };
    }
    console.error("loadUsageSummary failed:", error.message);
    return null;
  }

  const events = (data ?? []) as EventRow[];
  const last7Days = sumWindow(events, since7d);
  const thisMonth = sumWindow(events, sinceMonth);

  const featureMap = new Map<string, UsageFeatureRow>();
  for (const e of events) {
    if (e.created_at < since7d) continue;
    const cur = featureMap.get(e.feature) ?? {
      feature: e.feature,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    cur.calls += 1;
    cur.inputTokens += e.input_tokens;
    cur.outputTokens += e.output_tokens;
    cur.totalTokens += e.input_tokens + e.output_tokens;
    cur.estimatedCostUsd += eventCost(e);
    featureMap.set(e.feature, cur);
  }
  const byFeature = [...featureMap.values()].sort(
    (a, b) => b.estimatedCostUsd - a.estimatedCostUsd
  );

  const userMap = new Map<
    string,
    { calls: number; totalTokens: number; estimatedCostUsd: number }
  >();
  for (const e of events) {
    if (e.created_at < since7d) continue;
    const cur = userMap.get(e.user_id) ?? {
      calls: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    cur.calls += 1;
    cur.totalTokens += e.input_tokens + e.output_tokens;
    cur.estimatedCostUsd += eventCost(e);
    userMap.set(e.user_id, cur);
  }
  const topIds = [...userMap.entries()]
    .sort((a, b) => b[1].estimatedCostUsd - a[1].estimatedCostUsd)
    .slice(0, 15)
    .map(([id]) => id);

  const emailById = new Map<string, string | null>();
  if (topIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", topIds);
    for (const p of profiles ?? []) {
      emailById.set(p.id as string, (p.email as string | null) ?? null);
    }
  }

  const topUsers: UsageUserRow[] = topIds.map((id) => {
    const u = userMap.get(id)!;
    return {
      userId: id,
      email: emailById.get(id) ?? null,
      calls: u.calls,
      totalTokens: u.totalTokens,
      estimatedCostUsd: u.estimatedCostUsd,
    };
  });

  const oldest = events.length
    ? events.reduce(
        (min, e) => (e.created_at < min ? e.created_at : min),
        events[0]!.created_at
      )
    : null;

  return {
    last7Days,
    thisMonth,
    byFeature,
    topUsers,
    since: oldest,
    note:
      events.length === 0
        ? "No token events yet. Usage is recorded from the next Claude call after migration 0028 is applied."
        : "Estimated USD from list prices (Sonnet $3/$15 per MTok in/out). Not Anthropic Console invoice totals.",
  };
}
