import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activationProgressIndex,
  categorizeFirstValueFacts,
  firstValueCategoryLine,
} from "../activation.ts";

describe("activation first-value categories", () => {
  it("only returns categories with data", () => {
    const cats = categorizeFirstValueFacts([
      { label: "Deadline", value: "June 15", date: "2026-06-15" },
      { label: "Contact", value: "Maya Chen" },
      { label: "Fee", value: "$150" },
      { label: "Next step", value: "Call back Friday" },
    ]);
    assert.ok(cats.some((c) => c.id === "dates"));
    assert.ok(cats.some((c) => c.id === "amounts"));
    assert.ok(cats.every((c) => c.count > 0));
  });

  it("formats category lines", () => {
    assert.match(
      firstValueCategoryLine({
        id: "dates",
        label: "important dates",
        count: 2,
        samples: [],
      }),
      /2 important dates/
    );
  });

  it("maps steps to progress index", () => {
    assert.equal(activationProgressIndex("welcome"), 0);
    assert.equal(activationProgressIndex("add_knowledge"), 1);
    assert.equal(activationProgressIndex("ask_gideon"), 2);
    assert.equal(activationProgressIndex("completed"), 3);
  });
});
