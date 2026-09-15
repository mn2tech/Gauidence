import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IMAGE_ATTACHMENT_QUESTION,
  isDefaultAttachmentPrompt,
  isGenericVaultChatTitle,
  sanitizeGeneratedChatTitle,
  shouldGenerateVaultChatTitle,
} from "../vaultChatTitle";

describe("vaultChatTitle", () => {
  it("detects default attachment prompts", () => {
    assert.equal(
      isDefaultAttachmentPrompt(DEFAULT_IMAGE_ATTACHMENT_QUESTION),
      true
    );
    assert.equal(
      isDefaultAttachmentPrompt("Summarize what matters in invoice.pdf."),
      true
    );
    assert.equal(isDefaultAttachmentPrompt("When does my lease end?"), false);
  });

  it("detects generic sidebar titles", () => {
    assert.equal(isGenericVaultChatTitle("New chat"), true);
    assert.equal(
      isGenericVaultChatTitle(DEFAULT_IMAGE_ATTACHMENT_QUESTION),
      true
    );
    assert.equal(isGenericVaultChatTitle("Lease renewal date"), false);
  });

  it("generates titles for first exchange when prompt is generic or long", () => {
    assert.equal(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question: DEFAULT_IMAGE_ATTACHMENT_QUESTION,
      }),
      true
    );
    assert.equal(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question:
          "Can you walk me through every deadline mentioned in these board minutes from last quarter?",
      }),
      true
    );
    assert.equal(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question: "When does my lease end?",
      }),
      false
    );
    assert.equal(
      shouldGenerateVaultChatTitle({
        isFirstExchange: false,
        question: DEFAULT_IMAGE_ATTACHMENT_QUESTION,
      }),
      false
    );
  });

  it("sanitizes model output", () => {
    assert.equal(
      sanitizeGeneratedChatTitle('"Q3 grant deadline"'),
      "Q3 grant deadline"
    );
    assert.equal(
      sanitizeGeneratedChatTitle("## Board minutes review."),
      "Board minutes review"
    );
    assert.equal(sanitizeGeneratedChatTitle("   "), null);
  });
});
