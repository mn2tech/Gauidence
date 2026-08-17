import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedSource } from "../types";
import { updateConnectedSource } from "../services/connectedSources";
import {
  ensureGoogleDriveTokens,
  getGoogleDriveTokens,
  tokensToSettings,
} from "./client";

/** Refresh Drive tokens when expired and persist the rotation. */
export async function googleDriveAccessTokenForSource(
  supabase: SupabaseClient,
  userId: string,
  source: ConnectedSource
): Promise<string> {
  const current = getGoogleDriveTokens(source.settings);
  if (!current) {
    throw new Error(
      "Google Drive access is missing. Reconnect Google Drive to continue."
    );
  }
  const { tokens, rotated } = await ensureGoogleDriveTokens(current);
  if (rotated) {
    await updateConnectedSource(supabase, userId, source.id, {
      settings: tokensToSettings(tokens, source.settings),
    });
  }
  return tokens.accessToken;
}
