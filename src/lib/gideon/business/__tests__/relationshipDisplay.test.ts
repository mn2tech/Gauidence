import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeRelationshipRows,
  formatEntityRelationshipsAnswer,
  isNoisyRelationshipTarget,
} from "../relationshipDisplay";

describe("relationshipDisplay", () => {
  it("drops pasted document mentions and dedupes SERVES/SERVICES + projects", () => {
    assert.equal(
      isNoisyRelationshipTarget({
        name: "Pasted - Job Description.txt",
        entityType: "document",
        relationshipType: "MENTIONED_IN",
      }),
      true
    );

    const filtered = [
      {
        type: "MENTIONED_IN",
        relatedName: "Pasted - Job Description.txt",
        relatedType: "document",
        direction: "outgoing" as const,
        relatedId: "d1",
        relationshipId: "r0",
        confidence: 0.5,
      },
      {
        type: "SERVICES",
        relatedName: "Department of Defense",
        relatedType: "organization",
        direction: "outgoing" as const,
        relatedId: "a",
        relationshipId: "r1",
        confidence: 0.7,
      },
      {
        type: "SERVES",
        relatedName: "Department of Defense",
        relatedType: "organization",
        direction: "outgoing" as const,
        relatedId: "a",
        relationshipId: "r2",
        confidence: 0.8,
      },
      {
        type: "HAS_PROJECT",
        relatedName: "Enterprise Data Warehouse Migration",
        relatedType: "project",
        direction: "outgoing" as const,
        relatedId: "p1",
        relationshipId: "r3",
        confidence: 0.7,
      },
      {
        type: "HAS_PROJECT",
        relatedName:
          "Enterprise Data Warehouse Migration from Oracle to Cloud Platforms",
        relatedType: "project",
        direction: "outgoing" as const,
        relatedId: "p2",
        relationshipId: "r4",
        confidence: 0.7,
      },
      {
        type: "HAS_PROJECT",
        relatedName: "Onyx Data Management Toolkit",
        relatedType: "project",
        direction: "outgoing" as const,
        relatedId: "p3",
        relationshipId: "r5",
        confidence: 0.8,
      },
      {
        type: "OWNS",
        relatedName: "Onyx Data Management Toolkit",
        relatedType: "project",
        direction: "outgoing" as const,
        relatedId: "p3",
        relationshipId: "r6",
        confidence: 0.8,
      },
    ].filter(
      (r) =>
        !isNoisyRelationshipTarget({
          name: r.relatedName,
          entityType: r.relatedType,
          relationshipType: r.type,
        })
    );

    const rows = dedupeRelationshipRows(filtered);

    assert.equal(
      rows.filter((r) => /Department of Defense/i.test(r.relatedName)).length,
      1
    );
    assert.equal(
      rows.filter((r) => /Enterprise Data Warehouse/i.test(r.relatedName))
        .length,
      1
    );
    assert.match(
      rows.find((r) => /Enterprise Data Warehouse/i.test(r.relatedName))!
        .relatedName,
      /Oracle to Cloud Platforms/
    );

    const text = formatEntityRelationshipsAnswer(
      "Onyx Government Services, LLC.",
      rows
    ).join("\n");
    assert.match(text, /offers or relates to|Department of Defense/i);
    assert.match(text, /Department of Defense/);
    assert.doesNotMatch(text, /Pasted - Job Description/);
    assert.doesNotMatch(text, /MENTIONED_IN/);
    assert.doesNotMatch(text, /—\[/);
  });
});
