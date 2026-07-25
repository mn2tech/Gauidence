import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GUARDIAN_TIME_ZONE, isValidIanaTimeZone, type TimeZoneSource } from "@/lib/timezone";

export type { TimeZoneSource };

export type UserTimeZoneRow = {
  time_zone: string;
  time_zone_source: TimeZoneSource;
};

/** Resolve the signed-in user's IANA timezone (falls back to product default). */
export async function getUserTimeZone(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const row = await getUserTimeZoneRow(supabase, userId);
  return row.time_zone;
}

export async function getUserTimeZoneRow(
  supabase: SupabaseClient,
  userId: string
): Promise<UserTimeZoneRow> {
  const { data, error } = await supabase
    .from("profiles")
    .select("time_zone, time_zone_source")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { time_zone: GUARDIAN_TIME_ZONE, time_zone_source: "default" };
  }

  const timeZone =
    typeof data?.time_zone === "string" && isValidIanaTimeZone(data.time_zone)
      ? data.time_zone.trim()
      : GUARDIAN_TIME_ZONE;

  const source =
    data?.time_zone_source === "auto" ||
    data?.time_zone_source === "manual" ||
    data?.time_zone_source === "default"
      ? data.time_zone_source
      : "default";

  return { time_zone: timeZone, time_zone_source: source };
}
