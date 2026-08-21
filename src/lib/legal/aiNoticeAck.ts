/**
 * Client-side AI notice acknowledgment (fallback when DB migration
 * isn't applied yet, or to avoid re-prompting on every navigation).
 */

import { LEGAL_VERSIONS } from "@/lib/legal/versions";

export const AI_NOTICE_ACK_KEY = "guardian:ai-notice-ack";

export function readAiNoticeAcknowledged(
  version: string = LEGAL_VERSIONS.aiDisclaimer
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AI_NOTICE_ACK_KEY) === version;
  } catch {
    return false;
  }
}

export function writeAiNoticeAcknowledged(
  version: string = LEGAL_VERSIONS.aiDisclaimer
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_NOTICE_ACK_KEY, version);
  } catch {
    /* private mode / quota */
  }
}
