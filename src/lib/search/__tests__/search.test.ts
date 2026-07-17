import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIlikePattern,
  buildProfilePath,
  groupSearchResults,
  hrefForResult,
  sanitizeSearchQuery,
  scoreMatch,
  snippetAroundMatch,
  sortAndCapResults,
  type SearchResult,
} from "../index.ts";

describe("universal vault search helpers", () => {
  it("sanitizes queries", () => {
    assert.equal(sanitizeSearchQuery("  Sephora  "), "Sephora");
    assert.equal(sanitizeSearchQuery("a"), null);
    assert.equal(sanitizeSearchQuery(null), null);
  });

  it("escapes ilike wildcards", () => {
    assert.equal(buildIlikePattern("100%_off"), "%100\\%\\_off%");
  });

  it("builds parent vault paths", () => {
    const profiles = [
      { id: "f", display_name: "Michael Kola - Family", parent_profile_id: null },
      { id: "n", display_name: "Nolan Kola", parent_profile_id: "f" },
    ];
    assert.equal(
      buildProfilePath(profiles, "n"),
      "Michael Kola - Family › Nolan Kola"
    );
    assert.equal(buildProfilePath(profiles, "f"), "Michael Kola - Family");
  });

  it("scores exact title higher than body", () => {
    assert.ok(
      scoreMatch({ query: "Sephora", title: "Sephora" }) >
        scoreMatch({
          query: "Sephora",
          title: "Call notes",
          body: "Talked to Sephora today",
        })
    );
  });

  it("builds snippets around the match", () => {
    const snip = snippetAroundMatch(
      "Today I talked with Sephora about the invoice and she said she would follow up.",
      "Sephora",
      60
    );
    assert.match(snip, /Sephora/);
  });

  it("builds deep-link hrefs", () => {
    assert.equal(
      hrefForResult({ kind: "profile", id: "p1", profileId: "p1" }),
      "/dashboard?profileId=p1"
    );
    assert.match(
      hrefForResult({ kind: "daily_log", id: "l1", profileId: "p1" }),
      /logId=l1/
    );
    assert.match(
      hrefForResult({ kind: "chat", id: "c1", profileId: "p1" }),
      /^\/ask\?/
    );
  });

  it("sorts and groups results", () => {
    const results: SearchResult[] = [
      {
        kind: "daily_log",
        id: "1",
        profileId: "p",
        title: "Note",
        snippet: "Sephora",
        profilePath: "Family",
        occurredAt: "2026-01-01",
        href: "/x",
        score: 40,
      },
      {
        kind: "profile",
        id: "p",
        profileId: "p",
        title: "Sephora",
        snippet: "",
        profilePath: "Sephora",
        occurredAt: null,
        href: "/y",
        score: 100,
      },
    ];
    const sorted = sortAndCapResults(results);
    assert.equal(sorted[0]?.kind, "profile");
    const grouped = groupSearchResults(sorted);
    assert.equal(grouped.profiles.length, 1);
    assert.equal(grouped.dailyLogs.length, 1);
  });
});
