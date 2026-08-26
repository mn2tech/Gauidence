export type AssociationContext = {
  userId: string;
  spaceId: string;
  /** Explicit child Space id from upload context. */
  explicitChildId?: string | null;
  /** Active school context id when known. */
  schoolContextId?: string | null;
  /** Child Spaces under reachable family (id + display name). */
  childSpaces?: { id: string; display_name: string }[];
  /** Space profile type / name for leaf child Space uploads. */
  spaceProfileType?: string | null;
  spaceDisplayName?: string | null;
};

export type AssociationResult = {
  userId: string;
  spaceId: string;
  childId: string | null;
  schoolContextId: string | null;
};

/**
 * Associate an extracted item with user / space / child / school.
 * Never guesses a child relationship.
 */
export function associateGuardianItem(
  ctx: AssociationContext,
  childReference?: string | null
): AssociationResult {
  const schoolContextId = ctx.schoolContextId ?? null;

  if (ctx.explicitChildId) {
    return {
      userId: ctx.userId,
      spaceId: ctx.spaceId,
      childId: ctx.explicitChildId,
      schoolContextId,
    };
  }

  if (
    ctx.spaceProfileType === "child" ||
    ctx.spaceProfileType === "student"
  ) {
    return {
      userId: ctx.userId,
      spaceId: ctx.spaceId,
      childId: ctx.spaceId,
      schoolContextId,
    };
  }

  const ref = childReference?.trim().toLowerCase();
  if (ref && ctx.childSpaces && ctx.childSpaces.length > 0) {
    const matches = ctx.childSpaces.filter((c) => {
      const name = c.display_name.trim().toLowerCase();
      if (!name) return false;
      return (
        name === ref ||
        name.includes(ref) ||
        ref.includes(name) ||
        name.split(/\s+/)[0] === ref
      );
    });
    // Strong entity match only when exactly one child matches.
    if (matches.length === 1) {
      return {
        userId: ctx.userId,
        spaceId: ctx.spaceId,
        childId: matches[0]!.id,
        schoolContextId,
      };
    }
  }

  return {
    userId: ctx.userId,
    spaceId: ctx.spaceId,
    childId: null,
    schoolContextId,
  };
}
