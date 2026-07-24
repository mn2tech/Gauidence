import { describe, expect, it } from "vitest";
import {
  detectCrossVaultScope,
  profileMentionedInQuestion,
} from "../detectVaultScope";

const profiles = [
  { id: "personal", display_name: "Kola" },
  { id: "nolan", display_name: "Nolan" },
  { id: "emma", display_name: "Emma" },
  { id: "nolan-smith", display_name: "Nolan Smith" },
];

describe("detectVaultScope", () => {
  it("detects possessive mentions", () => {
    expect(profileMentionedInQuestion("Check Nolan's report card", "Nolan")).toBe(
      true
    );
    expect(profileMentionedInQuestion("When is my passport due?", "Nolan")).toBe(
      false
    );
  });

  it("returns a single cross-vault match", () => {
    expect(
      detectCrossVaultScope({
        question: "Check Nolan's report card",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      })
    ).toEqual({ id: "nolan", display_name: "Nolan" });
  });

  it("skips profiles already in rollup scope", () => {
    expect(
      detectCrossVaultScope({
        question: "Check Nolan's report card",
        activeProfileId: "family",
        inScopeProfileIds: ["family", "nolan"],
        accessibleProfiles: profiles,
      })
    ).toBeNull();
  });

  it("returns null when multiple children match", () => {
    expect(
      detectCrossVaultScope({
        question: "Compare Nolan and Emma report cards",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      })
    ).toBeNull();
  });

  it("disambiguates with a full name mention", () => {
    expect(
      detectCrossVaultScope({
        question: "Open Nolan Smith's homework folder",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      })
    ).toEqual({ id: "nolan-smith", display_name: "Nolan Smith" });
  });
});
