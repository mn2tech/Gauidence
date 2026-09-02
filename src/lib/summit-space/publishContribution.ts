import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovedEntitySpec,
  SummitCommunityContributionRow,
} from "./contributions";
import { slugifyEntityName } from "./contributions";
import { findOrCreateSlug, resolveEntityBySlug } from "./entityResolution";
import type { SummitEntityRow } from "./types";

const COMMUNITY_SOURCE_LABEL = "Community contribution — summit attendee";

export async function publishCommunityContribution(args: {
  admin: SupabaseClient;
  contribution: SummitCommunityContributionRow;
  approvedEntities: ApprovedEntitySpec[];
  publishedSummary?: string;
  reviewedBy: string;
}): Promise<{ entityIds: string[] }> {
  const { admin, contribution, approvedEntities, reviewedBy } = args;
  const slug = contribution.summit_slug;

  const { data: existingEntities } = await admin
    .from("summit_entities")
    .select("*")
    .eq("summit_slug", slug);

  const entities = (existingEntities ?? []) as SummitEntityRow[];
  const createdIds: string[] = [];
  const slugToId = new Map(entities.map((e) => [e.slug, e.id]));

  for (const spec of approvedEntities) {
    if (!spec.create) continue;

    const { slug: entitySlug, existing } = findOrCreateSlug(
      entities,
      spec.name,
      spec.entityType
    );

    const upsertPayload: Record<string, unknown> = {
      summit_slug: slug,
      entity_type: spec.entityType,
      slug: entitySlug,
      name: spec.name,
      description: spec.description ?? null,
      properties: {
        ...(spec.properties ?? {}),
        community_contribution_id: contribution.id,
      },
      lifecycle_status: "published",
      visibility: "public",
      source_label: COMMUNITY_SOURCE_LABEL,
      source_type: "community",
      source_url: contribution.source_url,
    };

    if (!existing) {
      const { data: inserted } = await admin
        .from("summit_entities")
        .upsert(upsertPayload, { onConflict: "summit_slug,slug" })
        .select("id, slug")
        .single();

      if (inserted) {
        createdIds.push(inserted.id);
        slugToId.set(inserted.slug, inserted.id);
        entities.push({
          ...(upsertPayload as SummitEntityRow),
          id: inserted.id,
          slug: inserted.slug,
        } as SummitEntityRow);
      }
    } else {
      createdIds.push(existing.id);
      await admin
        .from("summit_entities")
        .update({
          properties: {
            ...(existing.properties as Record<string, unknown>),
            community_contribution_id: contribution.id,
          },
          source_type: "community",
          source_label: COMMUNITY_SOURCE_LABEL,
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
  }

  for (const spec of approvedEntities) {
    if (!spec.create || !spec.relationshipType) continue;

    const sourceSlug = slugifyEntityName(spec.name);
    const sourceId = slugToId.get(sourceSlug);
    if (!sourceId) continue;

    let targetId: string | undefined;
    if (spec.relatedToSlug) {
      const resolved = resolveEntityBySlug(
        entities,
        spec.relatedToSlug,
        spec.relatedToType
      );
      targetId = resolved?.id ?? slugToId.get(spec.relatedToSlug);
    }

    if (!targetId || sourceId === targetId) continue;

    await admin.from("summit_relationships").upsert(
      {
        summit_slug: slug,
        source_entity_id: sourceId,
        relationship_type: spec.relationshipType,
        target_entity_id: targetId,
        lifecycle_status: "published",
        visibility: "public",
        source_label: COMMUNITY_SOURCE_LABEL,
        properties: { community_contribution_id: contribution.id },
      },
      {
        onConflict:
          "summit_slug,source_entity_id,relationship_type,target_entity_id",
      }
    );
  }

  const now = new Date().toISOString();
  await admin
    .from("summit_community_contributions")
    .update({
      status: "published",
      published_entity_ids: createdIds,
      published_summary: args.publishedSummary ?? contribution.content,
      reviewed_by: reviewedBy,
      reviewed_at: now,
      published_at: now,
      approved_entities: approvedEntities,
      updated_at: now,
    })
    .eq("id", contribution.id);

  return { entityIds: createdIds };
}
