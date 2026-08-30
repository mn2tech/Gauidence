import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitCompactAnswer } from "../compactAnswer";

describe("splitCompactAnswer", () => {
  it("leaves short answers alone", () => {
    const text = "NM2TECH is a consulting firm.\n\n- One project";
    const r = splitCompactAnswer(text);
    assert.equal(r.shouldCollapse, false);
    assert.equal(r.rest, null);
  });

  it("collapses long bullet dumps to lead + 3 bullets", () => {
    const text = [
      "NM2TECH overview.",
      "",
      "- Project A",
      "- Project B",
      "- Project C",
      "- Project D",
      "- Project E",
      "",
      "Sources",
      "- Chart.png",
    ].join("\n");
    const r = splitCompactAnswer(text);
    assert.equal(r.shouldCollapse, true);
    assert.ok(r.preview.includes("NM2TECH overview"));
    assert.ok(r.preview.includes("Project A"));
    assert.ok(r.preview.includes("Project C"));
    assert.ok(!r.preview.includes("Project D"));
    assert.ok(r.rest?.includes("Project D"));
  });
});
