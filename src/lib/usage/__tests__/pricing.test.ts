import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateClaudeCostParts,
  estimateClaudeCostUsd,
  formatUsd,
  rateForModel,
} from "../pricing.ts";

describe("usage pricing helpers", () => {
  it("picks Sonnet rates for claude-sonnet-4-5", () => {
    const rate = rateForModel("claude-sonnet-4-5");
    assert.equal(rate.inputPerMTok, 3);
    assert.equal(rate.outputPerMTok, 15);
  });

  it("estimates cost for 1M in + 1M out on Sonnet", () => {
    const cost = estimateClaudeCostUsd({
      model: "claude-sonnet-4-5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    assert.equal(cost, 18);
  });

  it("splits input and output USD", () => {
    const parts = estimateClaudeCostParts({
      model: "claude-sonnet-4-5",
      inputTokens: 1_000_000,
      outputTokens: 200_000,
    });
    assert.equal(parts.inputUsd, 3);
    assert.equal(parts.outputUsd, 3);
  });

  it("formats small amounts with more decimals", () => {
    assert.equal(formatUsd(0), "$0.00");
    assert.match(formatUsd(0.0042), /\$0\.0042/);
    assert.equal(formatUsd(1.5), "$1.50");
  });
});
