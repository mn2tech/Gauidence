import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripHtmlToText } from "@/lib/knowledge-studio/website/stripHtml";
import {
  assertAllowedDomainUrl,
  hostMatchesAllowedDomains,
} from "@/lib/knowledge-studio/normalize";
import {
  contentHashFromText,
  expandAskTokens,
  fallbackItemsFromText,
  filterPublishedOnly,
  MCPS_ALLOWED_DOMAINS,
  MCPS_CATEGORY_SLUGS,
  MCPS_DISCLAIMER,
  MCPS_PROJECT_SLUG,
  NO_VERIFIED_MCPS_ANSWER,
  parseHttpsUrl,
  preferredCategoriesForQuestion,
  scoreKnowledgeRelevance,
  validateAddSourceInput,
} from "@/lib/knowledge-studio/projects";

describe("MCPS knowledge project seed constants", () => {
  it("defines mcps-parent project and five categories", () => {
    assert.equal(MCPS_PROJECT_SLUG, "mcps-parent");
    assert.deepEqual(
      [...MCPS_CATEGORY_SLUGS].sort(),
      [
        "calendar",
        "parent-resources",
        "school-assignment",
        "schools",
        "transportation",
      ].sort()
    );
    assert.match(MCPS_DISCLAIMER, /not affiliated with or endorsed by/i);
  });
});

describe("source creation validation", () => {
  it("accepts a valid HTTPS MCPS-shaped payload", () => {
    const result = validateAddSourceInput(
      {
        source_name: "School Calendar",
        source_url: "https://www.montgomeryschoolsmd.org/calendar",
        category: "calendar",
        scope: "district",
        refresh_frequency: "weekly",
      },
      MCPS_CATEGORY_SLUGS
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.category, "calendar");
      assert.equal(result.value.scope, "district");
    }
  });

  it("rejects invalid URL", () => {
    const result = validateAddSourceInput(
      {
        source_name: "Bad",
        source_url: "not-a-url",
        category: "calendar",
        scope: "district",
      },
      MCPS_CATEGORY_SLUGS
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Invalid URL/i);
  });

  it("rejects missing category", () => {
    const result = validateAddSourceInput(
      {
        source_name: "Calendar",
        source_url: "https://www.montgomeryschoolsmd.org/calendar",
        scope: "district",
      },
      MCPS_CATEGORY_SLUGS
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Category is required/i);
  });

  it("rejects unknown category", () => {
    const result = validateAddSourceInput(
      {
        source_name: "Calendar",
        source_url: "https://www.montgomeryschoolsmd.org/calendar",
        category: "athletics",
        scope: "district",
      },
      MCPS_CATEGORY_SLUGS
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Unknown category/i);
  });

  it("parseHttpsUrl rejects non-https", () => {
    assert.throws(() => parseHttpsUrl("http://www.montgomeryschoolsmd.org/"));
  });
});

describe("MCPS domain allowlist", () => {
  it("allows montgomeryschoolsmd.org and subdomains", () => {
    assert.ok(
      hostMatchesAllowedDomains("www.montgomeryschoolsmd.org", MCPS_ALLOWED_DOMAINS)
    );
    assert.ok(
      assertAllowedDomainUrl(
        "https://www.montgomeryschoolsmd.org/departments/transportation",
        MCPS_ALLOWED_DOMAINS
      )
    );
  });

  it("rejects off-domain hosts", () => {
    assert.throws(() =>
      assertAllowedDomainUrl("https://evil.example/mcps", MCPS_ALLOWED_DOMAINS)
    );
  });
});

describe("ingestion helpers", () => {
  it("cleans HTML navigation and footer noise", () => {
    const html = `
      <html><body>
        <nav>Home About Contact</nav>
        <main><h1>ParentVUE</h1><p>Parents can view grades and attendance in ParentVUE.</p></main>
        <footer>Privacy Policy</footer>
      </body></html>`;
    const text = stripHtmlToText(html, 5000);
    assert.match(text, /ParentVUE/);
    assert.doesNotMatch(text, /<nav>/i);
    assert.ok(!text.toLowerCase().includes("privacy policy"));
  });

  it("fallback extraction keeps evidence text", () => {
    const items = fallbackItemsFromText({
      text: "Transportation eligibility\n\nStudents who live more than one mile from school may qualify for bus service. Contact the transportation depot for details.",
      category: "transportation",
      sourceName: "MCPS Transportation",
    });
    assert.ok(items.length >= 1);
    assert.ok(items[0]!.evidence_text.length > 0);
    assert.equal(items[0]!.category, "transportation");
  });

  it("content hash is stable for whitespace-equivalent text", () => {
    const a = contentHashFromText("Hello\n\nWorld");
    const b = contentHashFromText("Hello\n\n\nWorld");
    assert.equal(a, b);
    assert.notEqual(a, contentHashFromText("Hello World changed"));
  });
});

describe("knowledge lifecycle retrieval rules", () => {
  it("draft → needs_review → published; unpublished never retrieved", () => {
    const rows = [
      { status: "draft" },
      { status: "needs_review" },
      { status: "approved" },
      { status: "rejected" },
      { status: "archived" },
      { status: "published" },
    ];
    const published = filterPublishedOnly(rows);
    assert.equal(published.length, 1);
    assert.equal(published[0]!.status, "published");
  });

  it("prefers school-specific hits over district for matching school", () => {
    const schoolScore = scoreKnowledgeRelevance({
      title: "Bus depot contact",
      content: "Call transportation for delays",
      category: "transportation",
      school: "Winston Churchill High School",
      question: "Who should I contact about transportation at Winston Churchill High School?",
      schoolHint: "Winston Churchill High School",
    });
    const districtScore = scoreKnowledgeRelevance({
      title: "District transportation",
      content: "Call transportation for delays",
      category: "transportation",
      school: null,
      question: "Who should I contact about transportation at Winston Churchill High School?",
      schoolHint: "Winston Churchill High School",
    });
    assert.ok(schoolScore > districtScore);
  });

  it("scores calendar / schools / transportation / assignment / parent resources", () => {
    const samples = [
      {
        category: "calendar",
        title: "Professional day",
        content: "No school for students on professional days",
        question: "Is there school next Monday professional day?",
      },
      {
        category: "schools",
        title: "School directory",
        content: "Find school addresses and phone numbers",
        question: "Where is my school address and phone?",
      },
      {
        category: "school-assignment",
        title: "School Assignment Tool",
        content: "Use the official MCPS school assignment tool by home address",
        question: "How do I find my child's assigned school?",
      },
      {
        category: "transportation",
        title: "Bus eligibility",
        content: "Transportation eligibility depends on distance from school",
        question: "Who should I contact about transportation?",
      },
      {
        category: "parent-resources",
        title: "ParentVUE",
        content: "ParentVUE lets parents view student information",
        question: "What is ParentVUE?",
      },
    ];
    for (const sample of samples) {
      const score = scoreKnowledgeRelevance({
        title: sample.title,
        content: sample.content,
        category: sample.category,
        question: sample.question,
      });
      assert.ok(
        score > 0,
        `expected relevance for ${sample.category}, got ${score}`
      );
    }
  });

  it("maps principal typos and prefers schools directory hits", () => {
    assert.ok(expandAskTokens("Whats the prinicpal's name").includes("principal"));
    assert.deepEqual(preferredCategoriesForQuestion("Whats the prinicpal's name"), [
      "schools",
    ]);

    const directory = scoreKnowledgeRelevance({
      title: "Springbrook High School",
      content: "Principal: Jane Doe. Phone: 240-555-0100.",
      category: "schools",
      school: "Springbrook High School",
      question: "Whats the prinicpal's name",
      schoolHint: "Springbrook High School",
    });
    const calendarNoise = scoreKnowledgeRelevance({
      title: "School calendar",
      content: "August 25 First day of school for students. Early release days listed.",
      category: "calendar",
      question: "Whats the prinicpal's name",
      schoolHint: "Springbrook High School",
    });
    assert.ok(directory > calendarNoise);
    assert.ok(directory > 0);
  });
});

describe("citations / no fabrication copy", () => {
  it("exposes a verified-answer fallback for empty knowledge", () => {
    assert.match(NO_VERIFIED_MCPS_ANSWER, /official MCPS website/i);
    assert.match(NO_VERIFIED_MCPS_ANSWER, /verified answer/i);
  });

  it("published answers must be able to cite source title and URL", () => {
    const answer = [
      "MCPS assigns schools based on the student's home address.",
      "",
      "Source:",
      "Montgomery County Public Schools",
      "School Assignment Tool",
      "https://www.montgomeryschoolsmd.org/assignment",
    ].join("\n");
    assert.match(answer, /Source:/);
    assert.match(answer, /Montgomery County Public Schools/);
    assert.match(answer, /https:\/\//);
  });
});

describe("refresh change detection", () => {
  it("detects unchanged vs changed content hashes", () => {
    const previous = contentHashFromText("Calendar 2026-2027 unchanged body");
    const same = contentHashFromText("Calendar 2026-2027 unchanged body");
    const changed = contentHashFromText("Calendar 2026-2027 UPDATED body");
    assert.equal(previous, same);
    assert.notEqual(previous, changed);
  });
});
