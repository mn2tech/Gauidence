import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KNOWLEDGE_BASE_TEMPLATE_NAME,
  DEFAULT_PROPOSAL_TEMPLATE_SEEDS,
  templateSeedTotalCents,
} from "../defaultTemplates.ts";

describe("DEFAULT_PROPOSAL_TEMPLATE_SEEDS", () => {
  it("includes Guardian Knowledge Base with SOP and compliance deliverables", () => {
    const kb = DEFAULT_PROPOSAL_TEMPLATE_SEEDS.find(
      (s) => s.name === DEFAULT_KNOWLEDGE_BASE_TEMPLATE_NAME
    );
    assert.ok(kb);
    assert.equal(templateSeedTotalCents(kb!), 500000);
    assert.match(kb!.default_introduction, /SOP/i);
    assert.match(kb!.default_introduction, /compliance/i);
    assert.ok(
      kb!.default_deliverables.some((d) => /SOP/i.test(d.title))
    );
    assert.ok(
      kb!.default_deliverables.some((d) => /compliance/i.test(d.title))
    );
    assert.ok(kb!.default_addons.length >= 1);
  });

  it("has unique template names", () => {
    const names = DEFAULT_PROPOSAL_TEMPLATE_SEEDS.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
  });
});
