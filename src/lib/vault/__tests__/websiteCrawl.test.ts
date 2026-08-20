import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicHostname,
  extractSameOriginLinks,
  normalizeWebsiteUrl,
  rankUrlsForImport,
  stripHtmlToText,
  websitePageFileName,
} from "../websiteCrawl.ts";

describe("websiteCrawl", () => {
  it("normalizes bare domains to https", () => {
    assert.equal(
      normalizeWebsiteUrl("kendallcapital.com"),
      "https://kendallcapital.com/"
    );
  });

  it("blocks private hosts", () => {
    assert.throws(() => assertPublicHostname("localhost"), /can't be imported/i);
    assert.throws(() => assertPublicHostname("127.0.0.1"), /can't be imported/i);
    assert.throws(() => assertPublicHostname("192.168.1.4"), /can't be imported/i);
    assert.throws(() => normalizeWebsiteUrl("http://169.254.169.254/"), /can't be imported/i);
  });

  it("strips scripts and keeps readable text", () => {
    const text = stripHtmlToText(
      `<html><head><script>evil()</script><title>X</title></head>
       <body><h1>Hello</h1><p>Fee-only fiduciary advice.</p></body></html>`
    );
    assert.match(text, /Hello/);
    assert.match(text, /Fee-only fiduciary/);
    assert.doesNotMatch(text, /evil/);
  });

  it("extracts and ranks same-origin links", () => {
    const html = `
      <a href="/about/">About</a>
      <a href="/services">Services</a>
      <a href="https://other.com/x">External</a>
      <a href="/wp-admin">Admin</a>
      <a href="/fees/">Fees</a>
      <a href="/blog/deep/post/1">Deep</a>
    `;
    const links = extractSameOriginLinks(html, "https://kendallcapital.com/");
    assert.ok(links.some((l) => l.includes("/about")));
    assert.ok(links.some((l) => l.includes("/fees")));
    assert.ok(!links.some((l) => l.includes("other.com")));
    assert.ok(!links.some((l) => l.includes("wp-admin")));

    const ranked = rankUrlsForImport("https://kendallcapital.com/", [
      "https://kendallcapital.com/blog/deep/post/1",
      "https://kendallcapital.com/about",
      "https://kendallcapital.com/",
      "https://kendallcapital.com/fees",
    ]);
    assert.equal(ranked[0], "https://kendallcapital.com/");
    assert.ok(ranked.indexOf("https://kendallcapital.com/about") < ranked.indexOf("https://kendallcapital.com/blog/deep/post/1"));
  });

  it("builds stable website file names", () => {
    assert.match(
      websitePageFileName("About Us", "https://www.kendallcapital.com/about"),
      /^Website - kendallcapital\.com - About Us\.txt$/
    );
  });
});
