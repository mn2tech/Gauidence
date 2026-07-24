import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountAgeHours,
  isEligibleForRetentionEmail,
  retentionEmailsToTry,
} from "../eligibility.ts";
import type { UserActivitySnapshot } from "../types.ts";

const empty: UserActivitySnapshot = {
  hasVault: false,
  hasDocument: false,
  hasAskedGideon: false,
  hasResearch: false,
};

const sent = new Set<string>();

describe("retention eligibility", () => {
  it("sends welcome immediately for new accounts", () => {
    assert.equal(
      isEligibleForRetentionEmail("welcome", 0, empty, sent),
      true
    );
  });

  it("nudges vault after 24h when no vault", () => {
    assert.equal(
      isEligibleForRetentionEmail("nudge_no_vault", 25, empty, sent),
      true
    );
    assert.equal(
      isEligibleForRetentionEmail("nudge_no_vault", 10, empty, sent),
      false
    );
  });

  it("nudges document after 72h when vault exists", () => {
    const activity = { ...empty, hasVault: true };
    assert.equal(
      isEligibleForRetentionEmail("nudge_no_document", 80, activity, sent),
      true
    );
    assert.equal(
      isEligibleForRetentionEmail("nudge_no_document", 80, empty, sent),
      false
    );
  });

  it("nudges Gideon after 7 days when documents exist but no chat", () => {
    const activity = { ...empty, hasVault: true, hasDocument: true };
    assert.equal(
      isEligibleForRetentionEmail("nudge_try_gideon", 200, activity, sent),
      true
    );
    assert.equal(
      isEligibleForRetentionEmail(
        "nudge_try_gideon",
        200,
        { ...activity, hasAskedGideon: true },
        sent
      ),
      false
    );
  });

  it("skips keys already sent", () => {
    const already = new Set(["welcome" as const]);
    assert.equal(
      isEligibleForRetentionEmail("welcome", 0, empty, already),
      false
    );
  });

  it("lists all due emails for a stuck account without a vault", () => {
    const keys = retentionEmailsToTry(200, empty, new Set());
    assert.deepEqual(keys, ["welcome", "nudge_no_vault"]);
  });

  it("computes account age in hours", () => {
    const created = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const age = accountAgeHours(created);
    assert.ok(age >= 47.9 && age <= 48.1);
  });

  it("never auto-sends product announcement via retention cron", () => {
    assert.equal(
      isEligibleForRetentionEmail(
        "product_gideon_attachments",
        0,
        empty,
        sent
      ),
      false
    );
  });
});
