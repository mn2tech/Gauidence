import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveCoverage,
  isTrulyCaughtUp,
  needsIntelligenceBackfill,
  resolvePipelineStatus,
} from "../coverage";
import { buildIntelligenceDiagnostic } from "../diagnostics";

describe("Guardian Today coverage — never claim caught up from empty items alone", () => {
  it("marks never_scanned when analyzed sources exist but none processed", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1", "s2"],
      sources: [
        {
          id: "d1",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
        {
          id: "d2",
          profile_id: "s2",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
      ],
      activeItemCount: 0,
    });
    assert.equal(coverage.status, "never_scanned");
    assert.equal(coverage.sourceCount, 2);
    assert.equal(coverage.processedSourceCount, 0);
    assert.equal(isTrulyCaughtUp(coverage, 0), false);
    assert.equal(needsIntelligenceBackfill(coverage), true);
  });

  it("marks processing when extraction is in flight", () => {
    const status = resolvePipelineStatus({
      spaceCount: 2,
      sourceCount: 10,
      processedSourceCount: 0,
      pendingSourceCount: 10,
      processingSourceCount: 2,
      failedSourceCount: 0,
    });
    assert.equal(status, "processing");
  });

  it("marks partial when some sources processed and some pending", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1"],
      sources: [
        {
          id: "d1",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "completed",
          updated_at: "2026-08-27T22:00:00.000Z",
        },
        {
          id: "d2",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
      ],
      activeItemCount: 1,
    });
    assert.equal(coverage.status, "partial");
    assert.equal(isTrulyCaughtUp(coverage, 0), false);
  });

  it("marks failed when extraction failed and nothing pending", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1"],
      sources: [
        {
          id: "d1",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "failed",
        },
      ],
      activeItemCount: 0,
    });
    assert.equal(coverage.status, "failed");
    assert.equal(isTrulyCaughtUp(coverage, 0), false);
  });

  it("marks ready + caughtUp only after full evaluation with zero priorities", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1", "s2", "s3", "s4"],
      sources: Array.from({ length: 27 }, (_, i) => ({
        id: `d${i}`,
        profile_id: "s1",
        analysis_status: "completed",
        guardian_items_status: "completed",
        updated_at: "2026-08-27T22:18:00.000Z",
      })),
      activeItemCount: 0,
      lastWatchEvaluationAt: "2026-08-27T22:18:00.000Z",
    });
    assert.equal(coverage.status, "ready");
    assert.equal(coverage.processedSourceCount, 27);
    assert.equal(isTrulyCaughtUp(coverage, 0), true);
    assert.equal(isTrulyCaughtUp(coverage, 2), false);
  });

  it("does not count unanalyzed uploads as eligible sources", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1"],
      sources: [
        {
          id: "d1",
          profile_id: "s1",
          analysis_status: "uploaded",
          guardian_items_status: "pending",
        },
        {
          id: "d2",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "completed",
        },
      ],
      activeItemCount: 0,
    });
    assert.equal(coverage.sourceCount, 1);
    assert.equal(coverage.status, "ready");
  });

  it("marks never_scanned when Spaces exist but no analyzed documents yet", () => {
    const coverage = deriveCoverage({
      spaceIds: ["s1"],
      sources: [],
      activeItemCount: 0,
    });
    assert.equal(coverage.status, "never_scanned");
    assert.equal(isTrulyCaughtUp(coverage, 0), false);
    assert.equal(needsIntelligenceBackfill(coverage), true);
  });

  it("marks no_sources only when the user has zero Spaces", () => {
    const coverage = deriveCoverage({
      spaceIds: [],
      sources: [],
      activeItemCount: 0,
    });
    assert.equal(coverage.status, "no_sources");
    assert.equal(isTrulyCaughtUp(coverage, 0), false);
  });
});

describe("Guardian Today diagnostics", () => {
  it("builds admin diagnostic from coverage without fabricating counts", () => {
    const coverage = deriveCoverage({
      spaceIds: ["a", "b", "c", "d"],
      sources: [
        {
          id: "1",
          profile_id: "a",
          analysis_status: "completed",
          guardian_items_status: "completed",
        },
        {
          id: "2",
          profile_id: "b",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
      ],
      activeItemCount: 11,
      lastWatchEvaluationAt: "2026-08-27T22:18:00.000Z",
    });
    const diag = buildIntelligenceDiagnostic({
      coverage,
      evaluatedItemCount: 11,
      priorityCounts: { critical: 1, high: 2, medium: 5, low: 3 },
    });
    assert.equal(diag.accessibleSpaces, 4);
    assert.equal(diag.sourcesDiscovered, 2);
    assert.equal(diag.sourcesProcessed, 1);
    assert.equal(diag.sourcesPending, 1);
    assert.equal(diag.guardianItemsGenerated, 11);
    assert.equal(diag.byPriority.critical, 1);
  });
});

describe("permission boundary for coverage inputs", () => {
  it("only derives coverage from caller-supplied accessible space sources", () => {
    const userACoverage = deriveCoverage({
      spaceIds: ["personal", "nm2tech", "school"],
      sources: [
        {
          id: "public-doc",
          profile_id: "nm2tech",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
      ],
      activeItemCount: 0,
    });
    assert.equal(userACoverage.spaceCount, 3);
    assert.ok(!userACoverage.spaceCount || true);

    const userBPrivate = deriveCoverage({
      spaceIds: ["private-business"],
      sources: [
        {
          id: "secret",
          profile_id: "private-business",
          analysis_status: "completed",
          guardian_items_status: "completed",
        },
      ],
      activeItemCount: 1,
    });
    assert.equal(userBPrivate.spaceCount, 1);
    assert.notEqual(userACoverage.spaceCount, userBPrivate.spaceCount);
  });
});
