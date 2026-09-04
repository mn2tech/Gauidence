import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedSource } from "../types";
import { updateConnectedSource } from "../services/connectedSources";
import {
  ensureGmailTokens,
  getGmailTokens,
  gmailTokensToSettings,
} from "./client";

/** Refresh Gmail tokens when expired and persist the rotation. */
export async function gmailAccessTokenForSource(
  supabase: SupabaseClient,
  userId: string,
  source: ConnectedSource
): Promise<string> {
  const current = getGmailTokens(source.settings);
  if (!current) {
    throw new Error("Gmail access is missing. Reconnect Gmail to continue.");
  }
  const { tokens, rotated } = await ensureGmailTokens(current);
  if (rotated) {
    await updateConnectedSource(supabase, userId, source.id, {
      settings: gmailTokensToSettings(tokens, source.settings),
    });
  }
  return tokens.accessToken;
}
