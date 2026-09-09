/**
 * Pure Space-auth filters for My World (testable without DB).
 */

import type { SemanticEntity } from "@/lib/semantic/types";
import type { WorldEntity } from "./types";

export type AuthorizedSpaceSet = Set<string>;

/**
 * Keep entities that have evidence in an authorized space
 * or evidence with null space_id (manual / user-global).
 */
export function filterEntitiesByAuthorizedSpaces(args: {
  entities: SemanticEntity[];
  /** entityId → space_ids seen on linked evidence (null represented as null). */
  entityEvidenceSpaces: Map<string, Array<string | null>>;
  authorizedSpaceIds: AuthorizedSpaceSet;
}): WorldEntity[] {
  return args.entities.filter((entity) => {
    const spaces = args.entityEvidenceSpaces.get(entity.id);
    if (!spaces || spaces.length === 0) {
      return false;
    }
    return spaces.some(
      (spaceId) =>
        spaceId == null ||
        spaceId === "" ||
        args.authorizedSpaceIds.has(spaceId)
    );
  }) as WorldEntity[];
}

export function entityHasAuthorizedEvidence(args: {
  evidenceSpaces: Array<string | null>;
  authorizedSpaceIds: AuthorizedSpaceSet;
}): boolean {
  if (args.evidenceSpaces.length === 0) return false;
  return args.evidenceSpaces.some(
    (spaceId) =>
      spaceId == null ||
      spaceId === "" ||
      args.authorizedSpaceIds.has(spaceId)
  );
}
