import {
  IMMINENT_LOOKAHEAD_MS,
  IMMINENT_OVERDUE_MS,
} from "@/lib/reminders/time";

/** Inclusive due_at window for due-soon email/push (matches in-app imminent). */
export function dueSoonWindowIso(nowMs: number = Date.now()): {
  fromIso: string;
  toIso: string;
} {
  return {
    fromIso: new Date(nowMs - IMMINENT_OVERDUE_MS).toISOString(),
    toIso: new Date(nowMs + IMMINENT_LOOKAHEAD_MS).toISOString(),
  };
}

export function isDueSoonInstant(
  dueAtIso: string,
  nowMs: number = Date.now()
): boolean {
  const t = new Date(dueAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= nowMs - IMMINENT_OVERDUE_MS && t <= nowMs + IMMINENT_LOOKAHEAD_MS;
}
