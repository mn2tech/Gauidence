import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectedSource,
  ConnectedSourceStatus,
  ConnectedSourceType,
} from "../types";

type ConnectedSourceRow = {
  id: string;
  user_id: string;
  profile_id: string | null;
  source_type: ConnectedSourceType;
  display_name: string | null;
  source_uri: string | null;
  status: ConnectedSourceStatus;
  settings: Record<string, unknown> | null;
  last_scan_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapConnectedSource(row: ConnectedSourceRow): ConnectedSource {
  return {
    id: row.id,
    userId: row.user_id,
    profileId: row.profile_id,
    sourceType: row.source_type,
    displayName: row.display_name,
    sourceUri: row.source_uri,
    status: row.status,
    settings: row.settings ?? {},
    lastScanAt: row.last_scan_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Public mapping — never send Trello or Google Drive secrets to the browser. */
export function mapConnectedSourceForClient(
  row: ConnectedSourceRow
): ConnectedSource {
  const source = mapConnectedSource(row);
  if (source.sourceType === "trello") {
    const {
      apiKey: _k,
      token: _t,
      secret: _s,
      ...safe
    } = source.settings;
    return {
      ...source,
      settings: {
        ...safe,
        hasCredentials: Boolean(
          String(row.settings?.apiKey ?? "").trim() &&
            String(row.settings?.token ?? "").trim()
        ),
      },
    };
  }
  if (source.sourceType === "google_drive") {
    const {
      accessToken: _a,
      refreshToken: _r,
      tokenType: _tt,
      scope: _sc,
      expiresAt: _e,
      ...safe
    } = source.settings;
    return {
      ...source,
      settings: {
        ...safe,
        hasCredentials: Boolean(
          String(row.settings?.refreshToken ?? "").trim() ||
            String(row.settings?.accessToken ?? "").trim()
        ),
      },
    };
  }
  return source;
}

export async function listConnectedSources(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectedSource[]> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (
    (data as ConnectedSourceRow[] | null)?.map(mapConnectedSourceForClient) ?? []
  );
}

export async function getConnectedSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<ConnectedSource | null> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("id", sourceId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapConnectedSourceForClient(data as ConnectedSourceRow) : null;
}

/** Internal: includes secrets for server-side Trello / Google Drive API calls. */
export async function getConnectedSourceWithSecrets(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<ConnectedSource | null> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("id", sourceId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapConnectedSource(data as ConnectedSourceRow) : null;
}

export async function createConnectedSource(
  supabase: SupabaseClient,
  input: {
    userId: string;
    profileId?: string | null;
    sourceType: ConnectedSourceType;
    displayName: string;
    sourceUri: string;
    settings?: Record<string, unknown>;
  }
): Promise<ConnectedSource> {
  const { data, error } = await supabase
    .from("connected_sources")
    .insert({
      user_id: input.userId,
      profile_id: input.profileId ?? null,
      source_type: input.sourceType,
      display_name: input.displayName,
      source_uri: input.sourceUri,
      status: "connected",
      settings: input.settings ?? {},
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapConnectedSourceForClient(data as ConnectedSourceRow);
}

export async function updateConnectedSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string,
  patch: {
    status?: ConnectedSourceStatus;
    displayName?: string;
    settings?: Record<string, unknown>;
    lastScanAt?: string | null;
    sourceUri?: string | null;
    profileId?: string | null;
  }
): Promise<ConnectedSource> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.settings !== undefined) payload.settings = patch.settings;
  if (patch.lastScanAt !== undefined) payload.last_scan_at = patch.lastScanAt;
  if (patch.sourceUri !== undefined) payload.source_uri = patch.sourceUri;
  if (patch.profileId !== undefined) payload.profile_id = patch.profileId;

  const { data, error } = await supabase
    .from("connected_sources")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", sourceId)
    .select("*")
    .single();

  if (error) throw error;
  return mapConnectedSourceForClient(data as ConnectedSourceRow);
}

export async function disconnectConnectedSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<ConnectedSource> {
  return updateConnectedSource(supabase, userId, sourceId, {
    status: "disconnected",
  });
}
