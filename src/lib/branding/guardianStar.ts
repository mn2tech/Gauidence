/** Geometry for the Guardian start star (ported from the console animation). */

export type GuardianStarOptions = {
  pointH?: number;
  armH?: number;
  extra?: number;
};

export type GuardianStarRow = {
  spaces: number;
  stars: number;
};

export function buildGuardianStarRows(
  options: GuardianStarOptions = {},
): GuardianStarRow[] {
  const pointH = options.pointH ?? 5;
  const armH = options.armH ?? 5;
  const extra = options.extra ?? 24;

  const pointBase = 2 * pointH - 1;
  let width = pointBase + extra;
  if (width % 2 === 0) width += 1;

  const rows: GuardianStarRow[] = [];

  for (let i = 1; i <= pointH; i++) {
    const stars = 2 * i - 1;
    rows.push({ spaces: Math.floor((width - stars) / 2), stars });
  }

  for (let i = 0; i < armH; i++) {
    const stars = width - 2 * i;
    rows.push({ spaces: i, stars });
  }

  for (let i = armH - 2; i >= 0; i--) {
    const stars = width - 2 * i;
    rows.push({ spaces: i, stars });
  }

  for (let i = pointH; i >= 1; i--) {
    const stars = 2 * i - 1;
    rows.push({ spaces: Math.floor((width - stars) / 2), stars });
  }

  return rows;
}

export function countGuardianStarCells(rows: GuardianStarRow[]): number {
  return rows.reduce((sum, row) => sum + row.stars, 0);
}

export function renderGuardianStarFrame(
  rows: GuardianStarRow[],
  revealedStars: number,
): string[] {
  let remaining = Math.max(0, revealedStars);
  return rows.map((row) => {
    const take = Math.min(row.stars, remaining);
    remaining -= take;
    return `${" ".repeat(row.spaces)}${"*".repeat(take)}`;
  });
}
