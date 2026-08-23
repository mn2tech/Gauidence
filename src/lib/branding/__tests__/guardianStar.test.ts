import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGuardianStarRows,
  countGuardianStarCells,
  renderGuardianStarFrame,
} from "../guardianStar";

describe("buildGuardianStarRows", () => {
  it("matches the default console geometry", () => {
    const rows = buildGuardianStarRows();
    assert.equal(rows.length, 5 + 5 + 4 + 5);
    assert.deepEqual(rows[0], { spaces: 16, stars: 1 });
    assert.deepEqual(rows[4], { spaces: 12, stars: 9 });
    assert.deepEqual(rows[5], { spaces: 0, stars: 33 });
    assert.deepEqual(rows[9], { spaces: 4, stars: 25 });
    assert.deepEqual(rows[10], { spaces: 3, stars: 27 });
    assert.equal(countGuardianStarCells(rows), 315);
  });

  it("reveals cells left-to-right, top-to-bottom", () => {
    const rows = buildGuardianStarRows({ pointH: 2, armH: 2, extra: 2 });
    const frame = renderGuardianStarFrame(rows, 3);
    assert.equal(frame[0], "  *");
    assert.ok(frame[1].includes("**"));
    assert.ok(frame[1].startsWith(" "));
  });
});
