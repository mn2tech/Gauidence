import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProactiveSuggestions } from "./proactive";
import {
  normalizeKnowledgeKey,
  relationshipKey,
  timelineKey,
  type PersistKnowledgeResult,
} from "./normalize";
import type { KnowledgeInput, KnowledgePreview } from "./types";

export async function persistKnowledgePreview(
  supabase: SupabaseClient,
  userId: string,
  input: KnowledgeInput,
  preview: KnowledgePreview,
  options?: { profileNames?: string[] }
): Promise<PersistKnowledgeResult> {
  const result: PersistKnowledgeResult = {
    entities: 0,
    relationships: 0,
    timelineEvents: 0,
    suggestions: 0,
  };

  const profileId = input.profileId;
  const now = new Date().toISOString();

  for (const entity of preview.entities) {
    const name = entity.name.trim();
    if (!name) continue;
    const normalizedName =
      entity.normalizedName ?? normalizeKnowledgeKey(name);
    const { error } = await supabase.from("guardian_knowledge_entities").upsert(
      {
        owner_user_id: userId,
        profile_id: profileId,
        entity_type: entity.type,
        name,
        normalized_name: normalizedName,
        source_type: input.sourceType,
        source_id: input.sourceId,
        confidence: entity.confidence ?? null,
        metadata: entity.metadata ?? null,
        updated_at: now,
      },
      { onConflict: "owner_user_id,profile_id,entity_type,normalized_name" }
    );
    if (!error) result.entities += 1;
  }

  for (const rel of preview.suggestedRelationships) {
    const subject = rel.subject.trim();
    const object = rel.object.trim();
    if (!subject || !object) continue;
    const key = relationshipKey(subject, rel.relationship, object);
    const { error } = await supabase
      .from("guardian_knowledge_relationships")
      .upsert(
        {
          owner_user_id: userId,
          profile_id: profileId,
          subject,
          relationship: rel.relationship,
          object,
          normalized_key: key,
          source_type: rel.sourceType,
          source_id: rel.sourceId,
          confidence: rel.confidence,
        },
        { onConflict: "owner_user_id,profile_id,normalized_key" }
      );
    if (!error) result.relationships += 1;
  }

  for (const event of preview.suggestedTimelineEvents) {
    const title = event.title.trim();
    if (!title) continue;
    const key = timelineKey(title, event.eventDate, input.sourceId);
    const { error } = await supabase.from("guardian_workspace_timeline").upsert(
      {
        owner_user_id: userId,
        profile_id: profileId,
        title,
        event_date: event.eventDate ?? null,
        category: event.category ?? null,
        source_type: event.sourceType,
        source_id: event.sourceId,
        normalized_key: key,
        confidence: event.confidence,
      },
      { onConflict: "owner_user_id,profile_id,normalized_key" }
    );
    if (!error) result.timelineEvents += 1;
  }

  const suggestions = buildProactiveSuggestions(input, preview, {
    profileNames: options?.profileNames ?? [],
  });

  for (const suggestion of suggestions) {
    const { error } = await supabase
      .from("guardian_proactive_suggestions")
      .upsert(
        {
          owner_user_id: userId,
          profile_id: suggestion.profileId ?? profileId,
          kind: suggestion.kind,
          title: suggestion.title,
          body: suggestion.body ?? null,
          priority: suggestion.priority,
          status: "pending",
          due_date: suggestion.dueDate ?? null,
          source_type: suggestion.sourceType ?? input.sourceType,
          source_id: suggestion.sourceId ?? input.sourceId,
          normalized_key: suggestion.normalizedKey,
          metadata: suggestion.metadata ?? null,
          updated_at: now,
        },
        {
          onConflict: "owner_user_id,normalized_key",
          ignoreDuplicates: false,
        }
      );
    if (!error) result.suggestions += 1;
  }

  return result;
}
