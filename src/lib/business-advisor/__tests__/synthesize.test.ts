import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackSynthesis,
  parseSynthesis,
  resolveSynthesis,
} from "../synthesize.ts";
import type { AnalyzerFinding } from "../analyzers.ts";
import { DEFAULT_ADVISOR_CATALOG } from "../catalog.ts";

const sampleFinding: AnalyzerFinding = {
  analyzer: "security",
  category: "headers",
  severity: "high",
  title: "Missing security headers",
  description: "Missing HSTS and CSP.",
  business_impact: "Increase protection against common web attacks.",
  recommendation: "Add security headers.",
};

const catalog = DEFAULT_ADVISOR_CATALOG.map((item, index) => ({
  id: `catalog-${index}`,
  business_profile_id: "biz-1",
  is_active: true,
  ...item,
}));

describe("parseSynthesis", () => {
  it("parses fenced JSON", () => {
    const result = parseSynthesis(
      '```json\n{"industry":"general","executiveSummary":"Hello","opportunities":[],"outcomes":[],"recommendedSolutionKeys":[]}\n```'
    );
    assert.equal(result.industry, "general");
    assert.equal(result.executiveSummary, "Hello");
  });

  it("throws on empty output", () => {
    assert.throws(() => parseSynthesis(""), /empty output/i);
  });
});

describe("fallbackSynthesis", () => {
  it("maps findings to opportunities and solutions", () => {
    const result = fallbackSynthesis({
      companyName: "Proxdose",
      websiteUrl: "https://proxdose.com",
      findings: [sampleFinding],
      catalog,
    });
    assert.equal(result.opportunities.length, 1);
    assert.ok(result.recommendedSolutionKeys.includes("website_security_hardening"));
    assert.match(result.executiveSummary, /Proxdose/);
  });
});

describe("resolveSynthesis", () => {
  it("falls back when raw output is empty", () => {
    const result = resolveSynthesis("", {
      companyName: "Proxdose",
      websiteUrl: "https://proxdose.com",
      findings: [sampleFinding],
      catalog,
    });
    assert.equal(result.opportunities.length, 1);
  });
});
