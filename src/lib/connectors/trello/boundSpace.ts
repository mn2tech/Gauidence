/** Prefer music/practice spaces for Trello; fall back to the active space. */

export const TRELLO_PREFERRED_SPACE_NAME = "Wednesday Practice";

const SOFT_MATCH =
  /\b(wednesday\s*practice|living\s*waters|practice|set\s*list|setlist|chord|music|worship|songs?)\b/i;

/** True when a space name looks like music, worship, or practice. */
export function looksLikeMusicPracticeSpace(name?: string | null): boolean {
  if (!name?.trim()) return false;
  return SOFT_MATCH.test(name.trim());
}

/** True when Ask Gideon should use music/practice chips, stats, and song prompts. */
export function isMusicPracticeChatContext(opts: {
  spaceName?: string | null;
  boardName?: string | null;
  hasConnectedCharts?: boolean;
}): boolean {
  return (
    looksLikeMusicPracticeSpace(opts.spaceName) ||
    looksLikeMusicPracticeSpace(opts.boardName) ||
    Boolean(opts.hasConnectedCharts)
  );
}

/**
 * Pick which Guardian space Trello ontology should write into.
 * Exact preferred name → soft music/practice match → active → first space.
 */
export function findTrelloBoundProfile<
  T extends { id: string; display_name: string },
>(profiles: T[], active?: T | null): T | null {
  if (!profiles.length) return null;
  const preferred = TRELLO_PREFERRED_SPACE_NAME.toLowerCase();
  const exact =
    profiles.find((p) => p.display_name.trim().toLowerCase() === preferred) ??
    null;
  if (exact) return exact;

  const soft =
    profiles.find((p) => looksLikeMusicPracticeSpace(p.display_name)) ?? null;
  if (soft) return soft;

  if (active && profiles.some((p) => p.id === active.id)) return active;
  return profiles[0] ?? null;
}
