import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import {
  eventCalendarDay,
  lastSevenDayKeys,
  weekdayLabel,
} from "./days";
import { estimateClaudeCostParts } from "./pricing";

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
};

export type UsageFeatureRow = {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
};

export type UsageUserRow = {
  userId: string;
  email: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export type UsageDayRow = {
  /** Calendar date YYYY-MM-DD in Guardian timezone */
  date: string;
  /** Short label e.g. Mon */
  label: string;
  calls: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UsageSummary = {
  last7Days: UsageTotals;
  thisMonth: UsageTotals;
  byFeature: UsageFeatureRow[];
  topUsers: UsageUserRow[];
  dailyActivity: UsageDayRow[];
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
    inputCostUsd: 0,
    outputCostUsd: 0,
  };
}

function eventCostParts(e: EventRow): { inputUsd: number; outputUsd: number } {
  return estimateClaudeCostParts({
    model: e.model,
    inputTokens: e.input_tokens,
    outputTokens: e.output_tokens,
  });
}

function eventCost(e: EventRow): number {
  const parts = eventCostParts(e);
  return parts.inputUsd + parts.outputUsd;
}

function sumWindow(events: EventRow[], sinceIso: string): UsageTotals {
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let inputCostUsd = 0;
  let outputCostUsd = 0;
  for (const e of events) {
    if (e.created_at < sinceIso) continue;
    calls += 1;
    inputTokens += e.input_tokens;
    outputTokens += e.output_tokens;
    const parts = eventCostParts(e);
    inputCostUsd += parts.inputUsd;
    outputCostUsd += parts.outputUsd;
  }
  return {
    calls,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: inputCostUsd + outputCostUsd,
    inputCostUsd,
    outputCostUsd,
  };
}

function buildDailyActivity(
  events: EventRow[],
  sinceIso: string,
  dayKeys: string[]
): UsageDayRow[] {
  const byDay = new Map<
    string,
    { calls: number; totalTokens: number; estimatedCostUsd: number }
  >();
  for (const key of dayKeys) {
    byDay.set(key, { calls: 0, totalTokens: 0, estimatedCostUsd: 0 });
  }
  for (const e of events) {
    if (e.created_at < sinceIso) continue;
    const day = eventCalendarDay(e.created_at);
    const cur = byDay.get(day);
    if (!cur) continue;
    cur.calls += 1;
    cur.totalTokens += e.input_tokens + e.output_tokens;
    cur.estimatedCostUsd += eventCost(e);
  }
  return dayKeys.map((date) => {
    const cur = byDay.get(date)!;
    return {
      date,
      label: weekdayLabel(date),
      calls: cur.calls,
      totalTokens: cur.totalTokens,
      estimatedCostUsd: cur.estimatedCostUsd,
    };
  });
}

async function loadAuthUserMeta(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userIds: string[]
): Promise<
  Map<string, { email: string | null; lastSignInAt: string | null; createdAt: string | null }>
> {
  const out = new Map<
    string,
    { email: string | null; lastSignInAt: string | null; createdAt: string | null }
  >();
  if (userIds.length === 0) return out;

  // Prefer profiles for email; auth admin for sign-in times.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", userIds);
  for (const p of profiles ?? []) {
    out.set(p.id as string, {
      email: (p.email as string | null) ?? null,
      lastSignInAt: null,
      createdAt: null,
    });
  }

  try {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) {
      console.error("listUsers for usage meta failed:", error.message);
      return out;
    }
    const wanted = new Set(userIds);
    for (const u of data.users ?? []) {
      if (!wanted.has(u.id)) continue;
      const prev = out.get(u.id) ?? {
        email: null,
        lastSignInAt: null,
        createdAt: null,
      };
      out.set(u.id, {
        email: prev.email ?? u.email ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      });
    }
  } catch (err) {
    console.error(
      "listUsers for usage meta error:",
      err instanceof Error ? err.message : "unknown"
    );
  }

  return out;
}

/** Recent accounts (even with $0 AI) for login visibility. */
async function loadRecentAccounts(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  usageByUser: Map<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      inputCostUsd: number;
      outputCostUsd: number;
    }
  >
): Promise<UsageUserRow[]> {
  try {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });
    if (error || !data.users) {
      if (error) console.error("listUsers recent accounts:", error.message);
      return [];
    }
    const rows: UsageUserRow[] = data.users.map((u) => {
      const usage = usageByUser.get(u.id) ?? {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
      };
      return {
        userId: u.id,
        email: u.email ?? null,
        calls: usage.calls,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        inputCostUsd: usage.inputCostUsd,
        outputCostUsd: usage.outputCostUsd,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      };
    });
    rows.sort((a, b) => {
      if (b.estimatedCostUsd !== a.estimatedCostUsd) {
        return b.estimatedCostUsd - a.estimatedCostUsd;
      }
      const aT = a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0;
      const bT = b.lastSignInAt ? Date.parse(b.lastSignInAt) : 0;
      return bT - aT;
    });
    return rows.slice(0, 20);
  } catch (err) {
    console.error(
      "loadRecentAccounts error:",
      err instanceof Error ? err.message : "unknown"
    );
    return [];
  }
}

export async function loadUsageSummary(): Promise<UsageSummary | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceMonth = monthStartIso();
  const older = since7d < sinceMonth ? since7d : sinceMonth;
  const dayKeys = lastSevenDayKeys();

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
      const recentUsers = await loadRecentAccounts(admin, new Map());
      return {
        last7Days: emptyTotals(),
        thisMonth: emptyTotals(),
        byFeature: [],
        topUsers: recentUsers,
        dailyActivity: dayKeys.map((date) => ({
          date,
          label: weekdayLabel(date),
          calls: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        })),
        since: null,
        note: "Run migration 0028_llm_usage_events.sql in Supabase, then use Ask Gideon / Analyze so token rows appear. Login times still show from Auth.",
      };
    }
    console.error("loadUsageSummary failed:", error.message);
    return null;
  }

  const events = (data ?? []) as EventRow[];
  const last7Days = sumWindow(events, since7d);
  const thisMonth = sumWindow(events, sinceMonth);
  const dailyActivity = buildDailyActivity(events, since7d, dayKeys);

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
      inputCostUsd: 0,
      outputCostUsd: 0,
    };
    const parts = eventCostParts(e);
    cur.calls += 1;
    cur.inputTokens += e.input_tokens;
    cur.outputTokens += e.output_tokens;
    cur.totalTokens += e.input_tokens + e.output_tokens;
    cur.inputCostUsd += parts.inputUsd;
    cur.outputCostUsd += parts.outputUsd;
    cur.estimatedCostUsd += parts.inputUsd + parts.outputUsd;
    featureMap.set(e.feature, cur);
  }
  const byFeature = [...featureMap.values()].sort(
    (a, b) => b.estimatedCostUsd - a.estimatedCostUsd
  );

  const userMap = new Map<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      inputCostUsd: number;
      outputCostUsd: number;
    }
  >();
  for (const e of events) {
    if (e.created_at < since7d) continue;
    const cur = userMap.get(e.user_id) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
    };
    const parts = eventCostParts(e);
    cur.calls += 1;
    cur.inputTokens += e.input_tokens;
    cur.outputTokens += e.output_tokens;
    cur.totalTokens += e.input_tokens + e.output_tokens;
    cur.inputCostUsd += parts.inputUsd;
    cur.outputCostUsd += parts.outputUsd;
    cur.estimatedCostUsd += parts.inputUsd + parts.outputUsd;
    userMap.set(e.user_id, cur);
  }

  // Prefer auth-backed list (logins + usage). Fall back to usage-only.
  let topUsers = await loadRecentAccounts(admin, userMap);
  if (topUsers.length === 0 && userMap.size > 0) {
    const topIds = [...userMap.entries()]
      .sort((a, b) => b[1].estimatedCostUsd - a[1].estimatedCostUsd)
      .slice(0, 15)
      .map(([id]) => id);
    const meta = await loadAuthUserMeta(admin, topIds);
    topUsers = topIds.map((id) => {
      const u = userMap.get(id)!;
      const m = meta.get(id);
      return {
        userId: id,
        email: m?.email ?? null,
        calls: u.calls,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
        estimatedCostUsd: u.estimatedCostUsd,
        inputCostUsd: u.inputCostUsd,
        outputCostUsd: u.outputCostUsd,
        lastSignInAt: m?.lastSignInAt ?? null,
        createdAt: m?.createdAt ?? null,
      };
    });
  }

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
    dailyActivity,
    since: oldest,
    note:
      events.length === 0
        ? "No token events yet. Usage is recorded from the next Claude call after migration 0028 is applied. Login times still show from Auth."
        : "Estimated USD from list prices (Sonnet $3/$15 per MTok in/out). Not Anthropic Console invoice totals.",
  };
}
