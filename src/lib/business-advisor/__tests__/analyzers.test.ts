import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateCatalogPrice } from "../catalog.ts";
import { runSecurityAnalyzer, runWebsiteAnalyzer } from "../analyzers.ts";
import type { WebsiteDiscovery } from "../discovery.ts";

const baseDiscovery: WebsiteDiscovery = {
  url: "https://example.com",
  finalUrl: "https://example.com",
  statusCode: 200,
  title: "Example Company",
  metaDescription: "We help businesses grow with technology.",
  h1: "Welcome",
  textSample: "A".repeat(500),
  headers: { "content-type": "text/html" },
  isHttps: true,
  loadTimeMs: 1200,
};

describe("calculateCatalogPrice", () => {
  it("respects minimum and maximum", () => {
    const price = calculateCatalogPrice({
      estimated_hours: 2,
      hourly_rate_cents: 10000,
      minimum_price_cents: 50000,
      maximum_price_cents: 200000,
    });
    assert.equal(price, 50000);
  });
});

describe("security analyzer", () => {
  it("flags missing HTTPS", () => {
    const findings = runSecurityAnalyzer({
      ...baseDiscovery,
      isHttps: false,
      finalUrl: "http://example.com",
    });
    assert.ok(findings.some((f) => f.title.includes("HTTPS")));
  });

  it("flags missing security headers", () => {
    const findings = runSecurityAnalyzer(baseDiscovery);
    assert.ok(findings.some((f) => f.title.includes("security headers")));
  });
});

describe("website analyzer", () => {
  it("flags missing meta description", () => {
    const findings = runWebsiteAnalyzer({
      ...baseDiscovery,
      metaDescription: null,
    });
    assert.ok(findings.some((f) => f.title.includes("meta description")));
  });
});
