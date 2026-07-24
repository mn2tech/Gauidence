import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_ATTACHMENT_QUESTION,
  isDefaultAttachmentPrompt,
  isGenericVaultChatTitle,
  sanitizeGeneratedChatTitle,
  shouldGenerateVaultChatTitle,
} from "../vaultChatTitle";

describe("vaultChatTitle", () => {
  it("detects default attachment prompts", () => {
    expect(isDefaultAttachmentPrompt(DEFAULT_IMAGE_ATTACHMENT_QUESTION)).toBe(
      true
    );
    expect(
      isDefaultAttachmentPrompt("Summarize what matters in invoice.pdf.")
    ).toBe(true);
    expect(isDefaultAttachmentPrompt("When does my lease end?")).toBe(false);
  });

  it("detects generic sidebar titles", () => {
    expect(isGenericVaultChatTitle("New chat")).toBe(true);
    expect(isGenericVaultChatTitle(DEFAULT_IMAGE_ATTACHMENT_QUESTION)).toBe(
      true
    );
    expect(isGenericVaultChatTitle("Lease renewal date")).toBe(false);
  });

  it("generates titles for first exchange when prompt is generic or long", () => {
    expect(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question: DEFAULT_IMAGE_ATTACHMENT_QUESTION,
      })
    ).toBe(true);
    expect(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question:
          "Can you walk me through every deadline mentioned in these board minutes from last quarter?",
      })
    ).toBe(true);
    expect(
      shouldGenerateVaultChatTitle({
        isFirstExchange: true,
        question: "When does my lease end?",
      })
    ).toBe(false);
    expect(
      shouldGenerateVaultChatTitle({
        isFirstExchange: false,
        question: DEFAULT_IMAGE_ATTACHMENT_QUESTION,
      })
    ).toBe(false);
  });

  it("sanitizes model output", () => {
    expect(sanitizeGeneratedChatTitle('"Q3 grant deadline"')).toBe(
      "Q3 grant deadline"
    );
    expect(sanitizeGeneratedChatTitle("## Board minutes review.")).toBe(
      "Board minutes review"
    );
    expect(sanitizeGeneratedChatTitle("   ")).toBeNull();
  });
});
