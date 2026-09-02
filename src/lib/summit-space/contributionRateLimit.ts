import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTRIBUTION_RATE_LIMIT,
  CONTRIBUTION_RATE_WINDOW_MS,
} from "./contributions";

export function hashSubmissionIp(ip: string): string {
  return createHash("sha256").update(`summit-contrib:${ip}`).digest("hex");
}

const memoryBuckets = new Map<string, number[]>();

export function checkInMemoryRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - CONTRIBUTION_RATE_WINDOW_MS;
  const timestamps = (memoryBuckets.get(key) ?? []).filter(
    (t) => t > windowStart
  );
  if (timestamps.length >= CONTRIBUTION_RATE_LIMIT) {
    memoryBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  memoryBuckets.set(key, timestamps);
  return true;
}

export async function checkContributionRateLimit(args: {
  admin: SupabaseClient;
  summitSlug: string;
  ipHash: string;
}): Promise<boolean> {
  const { admin, summitSlug, ipHash } = args;
  const memoryKey = `${summitSlug}:${ipHash}`;
  if (!checkInMemoryRateLimit(memoryKey)) return false;

  const windowStart = new Date(
    Date.now() - CONTRIBUTION_RATE_WINDOW_MS
  ).toISOString();

  const { count } = await admin
    .from("summit_contribution_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("summit_slug", summitSlug)
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= CONTRIBUTION_RATE_LIMIT) return false;

  await admin.from("summit_contribution_rate_events").insert({
    summit_slug: summitSlug,
    ip_hash: ipHash,
  });

  return true;
}

export function resetRateLimitForTests(): void {
  memoryBuckets.clear();
}
