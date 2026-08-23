import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectedSource,
  ConnectedSourceAccess,
  ConnectedSourceStatus,
  ConnectedSourceType,
} from "../types";
import {
  canManageConnectedSource,
  canUseConnectedSourceSecrets,
  connectedSourceAccessForUser,
  isProfileSharedSourceType,
  PROFILE_SHARED_SOURCE_TYPES,
} from "./connectionAccess";

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

function withAccessFlags(
  source: ConnectedSource,
  viewerUserId: string,
  canUseSecrets: boolean
): ConnectedSource {
  const access: ConnectedSourceAccess = connectedSourceAccessForUser(
    source.userId,
    viewerUserId
  );
  return {
    ...source,
    access,
    canManage: canManageConnectedSource(source.userId, viewerUserId),
    canUseSecrets,
  };
}

/** Public mapping — never send Trello or Google Drive secrets to the browser. */
export function mapConnectedSourceForClient(
  row: ConnectedSourceRow,
  viewerUserId: string,
  canUseSecrets = true
): ConnectedSource {
  const source = mapConnectedSource(row);
  let mapped: ConnectedSource;
  if (source.sourceType === "trello") {
    const {
      apiKey: _k,
      token: _t,
      secret: _s,
      ...safe
    } = source.settings;
    mapped = {
      ...source,
      settings: {
        ...safe,
        hasCredentials: Boolean(
          String(row.settings?.apiKey ?? "").trim() &&
            String(row.settings?.token ?? "").trim()
        ),
      },
    };
  } else if (source.sourceType === "google_drive") {
    const {
      accessToken: _a,
      refreshToken: _r,
      tokenType: _tt,
      scope: _sc,
      expiresAt: _e,
      ...safe
    } = source.settings;
    mapped = {
      ...source,
      settings: {
        ...safe,
        hasCredentials: Boolean(
          String(row.settings?.refreshToken ?? "").trim() ||
            String(row.settings?.accessToken ?? "").trim()
        ),
      },
    };
  } else {
    mapped = source;
  }
  return withAccessFlags(mapped, viewerUserId, canUseSecrets);
}

async function mapRowForClient(
  supabase: SupabaseClient,
  viewerUserId: string,
  row: ConnectedSourceRow
): Promise<ConnectedSource> {
  const canUseSecrets = await canUseConnectedSourceSecrets(supabase, viewerUserId, {
    ownerUserId: row.user_id,
    profileId: row.profile_id,
    sourceType: row.source_type,
  });
  return mapConnectedSourceForClient(row, viewerUserId, canUseSecrets);
}

async function mapRowForClientWithSecrets(
  supabase: SupabaseClient,
  viewerUserId: string,
  row: ConnectedSourceRow
): Promise<ConnectedSource | null> {
  const canUseSecrets = await canUseConnectedSourceSecrets(supabase, viewerUserId, {
    ownerUserId: row.user_id,
    profileId: row.profile_id,
    sourceType: row.source_type,
  });
  if (!canUseSecrets) return null;
  return withAccessFlags(mapConnectedSource(row), viewerUserId, canUseSecrets);
}

export async function listConnectedSources(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectedSource[]> {
  const { data: memberships, error: memberError } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);
  if (memberError) throw memberError;

  const profileIds = [
    ...new Set(
      (memberships ?? [])
        .map((row) => String(row.profile_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const [ownResult, sharedResult] = await Promise.all([
    supabase
      .from("connected_sources")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    profileIds.length
      ? supabase
          .from("connected_sources")
          .select("*")
          .in("profile_id", profileIds)
          .in("source_type", PROFILE_SHARED_SOURCE_TYPES)
          .neq("user_id", userId)
          .neq("status", "disconnected")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as ConnectedSourceRow[], error: null }),
  ]);

  if (ownResult.error) throw ownResult.error;
  if (sharedResult.error) throw sharedResult.error;

  const byId = new Map<string, ConnectedSourceRow>();
  for (const row of [
    ...((ownResult.data as ConnectedSourceRow[] | null) ?? []),
    ...((sharedResult.data as ConnectedSourceRow[] | null) ?? []),
  ]) {
    byId.set(row.id, row);
  }

  const rows = [...byId.values()].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return Promise.all(rows.map((row) => mapRowForClient(supabase, userId, row)));
}

export async function getConnectedSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<ConnectedSource | null> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as ConnectedSourceRow;
  if (
    row.user_id !== userId &&
    (!row.profile_id || !isProfileSharedSourceType(row.source_type))
  ) {
    return null;
  }
  return mapRowForClient(supabase, userId, row);
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
    .eq("id", sourceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as ConnectedSourceRow;
  if (
    row.user_id !== userId &&
    (!row.profile_id || !isProfileSharedSourceType(row.source_type))
  ) {
    return null;
  }
  return mapRowForClientWithSecrets(supabase, userId, row);
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
  return mapConnectedSourceForClient(
    data as ConnectedSourceRow,
    input.userId,
    true
  );
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
  const existing = await getConnectedSource(supabase, userId, sourceId);
  if (!existing?.canManage) {
    throw new Error("Only the connection owner can change these settings.");
  }

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
    .eq("id", sourceId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return mapConnectedSourceForClient(data as ConnectedSourceRow, userId, true);
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
