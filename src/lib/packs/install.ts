import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPackDefinition } from "./catalog";
import { ensureRecommendedSpace } from "./spaces";
import type {
  InstallPackInput,
  InstallPackResult,
  ProfilePackConfiguration,
  ProfilePackRow,
} from "./types";

async function recordInstallEvent(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    packId: string;
    packVersionId: string;
    eventType: string;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("pack_install_events").insert({
    profile_id: args.profileId,
    pack_id: args.packId,
    pack_version_id: args.packVersionId,
    event_type: args.eventType,
    actor_user_id: args.actorUserId,
    metadata: args.metadata ?? {},
  });
}

/**
 * Idempotent Pack installation for a business/nonprofit Space.
 * Re-running with the same profile + pack does not duplicate Spaces.
 */
export async function installPack(
  supabase: SupabaseClient,
  input: InstallPackInput
): Promise<InstallPackResult> {
  const definition = await loadPackDefinition(supabase, input.packSlug);
  if (!definition) {
    throw new Error(`Pack "${input.packSlug}" was not found.`);
  }

  const selectedKeys = new Set(
    input.selectedSpaceKeys.filter((k) =>
      definition.spaces.some((s) => s.key === k)
    )
  );

  const { data: existing } = await supabase
    .from("profile_packs")
    .select(
      "id, profile_id, pack_id, pack_version_id, status, installed_at, installed_by, updated_at, configuration"
    )
    .eq("profile_id", input.profileId)
    .eq("pack_id", definition.pack.id)
    .maybeSingle();

  let profilePack: ProfilePackRow;
  let alreadyInstalled = false;

  if (existing) {
    alreadyInstalled = existing.status === "installed";
    const prevConfig =
      (existing.configuration as ProfilePackConfiguration) ?? {};
    const configuration: ProfilePackConfiguration = {
      ...prevConfig,
      selectedSpaceKeys: Array.from(selectedKeys),
    };

    const { data: updated, error } = await supabase
      .from("profile_packs")
      .update({
        pack_version_id: definition.version.id,
        status: "installed",
        configuration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        "id, profile_id, pack_id, pack_version_id, status, installed_at, installed_by, updated_at, configuration"
      )
      .single();

    if (error || !updated) {
      throw new Error(error?.message ?? "Failed to update pack installation.");
    }
    profilePack = updated as ProfilePackRow;

    await recordInstallEvent(supabase, {
      profileId: input.profileId,
      packId: definition.pack.id,
      packVersionId: definition.version.id,
      eventType: alreadyInstalled ? "reinstall" : "reenable",
      actorUserId: input.installedBy,
      metadata: { selectedSpaceKeys: Array.from(selectedKeys) },
    });
  } else {
    const configuration: ProfilePackConfiguration = {
      selectedSpaceKeys: Array.from(selectedKeys),
    };

    const { data: created, error } = await supabase
      .from("profile_packs")
      .insert({
        profile_id: input.profileId,
        pack_id: definition.pack.id,
        pack_version_id: definition.version.id,
        status: "installed",
        installed_by: input.installedBy,
        configuration,
      })
      .select(
        "id, profile_id, pack_id, pack_version_id, status, installed_at, installed_by, updated_at, configuration"
      )
      .single();

    if (error || !created) {
      throw new Error(error?.message ?? "Failed to install pack.");
    }
    profilePack = created as ProfilePackRow;

    await recordInstallEvent(supabase, {
      profileId: input.profileId,
      packId: definition.pack.id,
      packVersionId: definition.version.id,
      eventType: "install",
      actorUserId: input.installedBy,
      metadata: { selectedSpaceKeys: Array.from(selectedKeys) },
    });
  }

  const spaceResults = [];
  const { data: parentRow } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", input.profileId)
    .maybeSingle();
  const ownerUserId = String(parentRow?.owner_user_id ?? input.installedBy);

  for (const packSpace of definition.spaces) {
    if (!selectedKeys.has(packSpace.key)) continue;

    const { data: mapped } = await supabase
      .from("profile_pack_spaces")
      .select("id, space_profile_id, created_new")
      .eq("profile_pack_id", profilePack.id)
      .eq("pack_space_key", packSpace.key)
      .maybeSingle();

    if (mapped?.space_profile_id) {
      spaceResults.push({
        key: packSpace.key,
        spaceProfileId: String(mapped.space_profile_id),
        displayName: packSpace.display_name,
        createdNew: false,
        reused: true,
      });
      continue;
    }

    const ensured = await ensureRecommendedSpace(supabase, {
      parentProfileId: input.profileId,
      ownerUserId,
      packSpace,
    });

    await supabase.from("profile_pack_spaces").upsert(
      {
        profile_pack_id: profilePack.id,
        pack_space_key: ensured.key,
        space_profile_id: ensured.spaceProfileId,
        created_new: ensured.createdNew,
      },
      { onConflict: "profile_pack_id,pack_space_key" }
    );

    spaceResults.push(ensured);
  }

  return {
    profilePack,
    spaces: spaceResults,
    alreadyInstalled,
  };
}
