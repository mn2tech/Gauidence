import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentChatContext,
  sanitizeChatQuestion,
  CHAT_MESSAGE_MAX_CHARS,
} from "../../chat/context.ts";

describe("document chat context", () => {
  it("refuses when there is no analysis to ground answers", () => {
    const result = buildDocumentChatContext({
      fileName: "blank.pdf",
      summary: null,
      facts: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_analysis");
  });

  it("includes source labels for facts", () => {
    const result = buildDocumentChatContext({
      fileName: "invoice.pdf",
      summary: "An invoice from NM2TECH.",
      documentType: "invoice",
      facts: [
        { label: "Invoice number", value: "#0000016", source: "document" },
        { label: "Calculated total", value: "$71,628.00", source: "calculated" },
        { label: "Suggestion", value: "Pay by due date", source: "ai_generated" },
      ],
      specialist: { invoice_number: "#0000016", __raw_model: { skip: true } },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.context, /\[document\] Invoice number: #0000016/);
    assert.match(result.context, /\[calculated\] Calculated total/);
    assert.match(result.context, /\[ai\] Suggestion/);
    assert.match(result.context, /"invoice_number":"#0000016"/);
    assert.doesNotMatch(result.context, /__raw_model/);
  });

  it("truncates overlong questions", () => {
    const long = "a".repeat(CHAT_MESSAGE_MAX_CHARS + 50);
    const sanitized = sanitizeChatQuestion(long);
    assert.ok(sanitized);
    assert.equal(sanitized!.length, CHAT_MESSAGE_MAX_CHARS);
  });

  it("rejects empty questions", () => {
    assert.equal(sanitizeChatQuestion("   "), null);
    assert.equal(sanitizeChatQuestion(null), null);
  });
});
