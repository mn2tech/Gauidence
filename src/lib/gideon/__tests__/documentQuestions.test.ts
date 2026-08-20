import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionsFromDocuments } from "../documentQuestions";
import { buildGideonSuggestions } from "@/lib/vault/gideon";

describe("buildQuestionsFromDocuments", () => {
  it("builds Form CRS style questions from analysis metadata", () => {
    const qs = buildQuestionsFromDocuments([
      {
        title: "Client Relationship Summary",
        fileName: "2025 Form CRS.pdf",
        documentType: "general",
        summary:
          "Kendall Capital Management offers financial planning, portfolio management, and discloses conflicts of interest and fees.",
        organizations: ["Kendall Capital Management, Inc."],
        suggestedQuestions: [
          "What are the important dates?",
          "Summarize the key details.",
          "What do we know about Kendall Capital Management,",
        ],
      },
    ]);
    assert.ok(qs.length >= 3 && qs.length <= 4);
    assert.ok(qs.some((q) => /What do we know about Kendall Capital/i.test(q)));
    assert.ok(
      qs.some((q) => /fees|services|conflicts|Form CRS|Summarize/i.test(q))
    );
    assert.ok(!qs.some((q) => /important dates|key details/i.test(q)));
    assert.ok(!qs.some((q) => /\.\?|,\?/.test(q)));
    assert.ok(!qs.some((q) => /Inc\??$/i.test(q)));
  });

  it("prefers useful stored suggested_questions", () => {
    const qs = buildQuestionsFromDocuments([
      {
        title: "Policy",
        summary: "Cybersecurity policy requirements for vendors.",
        suggestedQuestions: [
          "What does the cybersecurity policy require?",
          "What are the important dates?",
        ],
      },
    ]);
    assert.ok(qs.some((q) => /cybersecurity policy/i.test(q)));
    assert.ok(!qs.some((q) => /important dates/i.test(q)));
  });
});

describe("buildGideonSuggestions document preference", () => {
  it("leads with document-grounded chips for business spaces", () => {
    const qs = buildGideonSuggestions(
      [
        {
          title: "Form CRS",
          fileName: "Form CRS.pdf",
          documentType: "general",
          summary: "Fee-only advisory firm offering portfolio management.",
          organizations: ["Kendall Capital"],
        },
      ],
      "business"
    );
    assert.ok(qs.some((q) => /Kendall Capital|services|fees|Form CRS/i.test(q)));
    assert.ok(!qs.some((q) => /How many employees/i.test(q)));
  });
});
