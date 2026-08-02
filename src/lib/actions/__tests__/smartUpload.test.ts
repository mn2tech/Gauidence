import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSmartUploadPresentation,
  shouldPromptSmartUpload,
} from "../smartUpload.ts";
import type { VaultUploadResult } from "@/lib/vault/clientUpload";

const baseResult: VaultUploadResult = {
  documentId: "doc-1",
  fileName: "payroll-report.pdf",
  analyzed: true,
  title: "Payroll Report",
  documentType: "payroll",
  classificationConfidence: 0.98,
  organizationSuggestion: {
    id: "sug-1",
    documentId: "doc-1",
    headline: "Payroll report for NM2TECH",
    recommendedAction: "save_to_existing",
    profileName: "NM2TECH",
    vaultName: "Payroll",
    profilePath: "NM2TECH → Payroll",
    detected: ["NM2TECH"],
    tags: ["payroll"],
    reason: "Matches business payroll vault",
    confidence: 0.98,
    showConfidence: false,
    duplicateWarning: null,
    status: "pending",
    autoApplied: false,
    previousProfileId: "current",
    suggestedProfileId: "biz",
    suggestedVaultId: "payroll-vault",
  },
};

describe("smart upload helpers", () => {
  it("builds presentation with confidence and path", () => {
    const presentation = buildSmartUploadPresentation(baseResult, "Personal");
    assert.ok(presentation);
    assert.equal(presentation?.title, "Payroll Report");
    assert.match(presentation?.profilePath ?? "", /NM2TECH/);
    assert.equal(presentation?.confidence, 0.98);
  });

  it("prompts when target vault differs from current profile", () => {
    assert.equal(shouldPromptSmartUpload(baseResult, "current"), true);
    assert.equal(shouldPromptSmartUpload(baseResult, "payroll-vault"), false);
  });

  it("skips prompt when auto-applied", () => {
    assert.equal(
      shouldPromptSmartUpload(
        { ...baseResult, organizationAutoApplied: true },
        "current"
      ),
      false
    );
  });
});
