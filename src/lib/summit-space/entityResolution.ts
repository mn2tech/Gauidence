import type { SummitEntityRow } from "./types";
import { slugifyEntityName } from "./contributions";

export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveEntityByName(
  entities: SummitEntityRow[],
  name: string,
  entityType?: string
): SummitEntityRow | undefined {
  const slug = slugifyEntityName(name);
  const normalized = normalizeEntityName(name);

  const bySlug = entities.find(
    (e) =>
      e.slug === slug &&
      (!entityType || e.entity_type === entityType)
  );
  if (bySlug) return bySlug;

  return entities.find((e) => {
    if (entityType && e.entity_type !== entityType) return false;
    return normalizeEntityName(e.name) === normalized;
  });
}

export function resolveEntityBySlug(
  entities: SummitEntityRow[],
  slug: string,
  entityType?: string
): SummitEntityRow | undefined {
  return entities.find(
    (e) =>
      e.slug === slug && (!entityType || e.entity_type === entityType)
  );
}

export function findOrCreateSlug(
  entities: SummitEntityRow[],
  name: string,
  entityType: string
): { slug: string; existing: SummitEntityRow | undefined } {
  const existing = resolveEntityByName(entities, name, entityType);
  if (existing?.slug) {
    return { slug: existing.slug, existing };
  }
  return { slug: slugifyEntityName(name), existing: undefined };
}
