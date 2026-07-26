import { describe, expect, it } from "vitest";
import {
  buildVaultChatRetrievalScopes,
  chatScopedProfilePayload,
  detectCrossVaultScope,
  detectMentionedVault,
  profileMentionedInQuestion,
  resolveGideonWriteVault,
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
    expect(profileMentionedInQuestion("show Nolans summer camp flyer", "Nolan")).toBe(
      true
    );
    expect(profileMentionedInQuestion("When is my passport due?", "Nolan")).toBe(
      false
    );
  });

  it("detects cross-vault from possessive without apostrophe", () => {
    expect(
      detectCrossVaultScope({
        question: "show Nolans summer camp flyer",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      })
    ).toEqual({ id: "nolan", display_name: "Nolan" });
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

describe("detectMentionedVault", () => {
  it("finds a named vault even when all vaults are in read scope", () => {
    expect(
      detectMentionedVault({
        question: "Check Nolan's report card",
        accessibleProfiles: profiles,
      })
    ).toEqual({ id: "nolan", display_name: "Nolan" });
  });

  it("returns null when multiple vaults are named", () => {
    expect(
      detectMentionedVault({
        question: "Compare Nolan and Emma report cards",
        accessibleProfiles: profiles,
      })
    ).toBeNull();
  });
});

describe("resolveGideonWriteVault", () => {
  it("prefers an explicit vault mention over retrieval dominance", () => {
    expect(
      resolveGideonWriteVault({
        question: "Remind me about Nolan's soccer game",
        activeProfileId: "personal",
        accessibleProfiles: profiles,
        retrievedChunks: [{ profile_id: "emma" }, { profile_id: "emma" }],
      })
    ).toEqual({ id: "nolan", display_name: "Nolan" });
  });

  it("falls back to the active vault when nothing else matches", () => {
    expect(
      resolveGideonWriteVault({
        question: "What invoices are due?",
        activeProfileId: "personal",
        accessibleProfiles: profiles,
        retrievedChunks: [],
      })
    ).toEqual({ id: "personal", display_name: "Kola" });
  });
});

describe("buildVaultChatRetrievalScopes", () => {
  const accessible = [
    { id: "personal", display_name: "Kola", profile_type: "personal" as const },
    { id: "nolan", display_name: "Nolan", profile_type: "child" as const },
    { id: "emma", display_name: "Emma", profile_type: "child" as const },
  ];

  it("searches all accessible vaults when no scoped profile is set", () => {
    expect(
      buildVaultChatRetrievalScopes({
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
        scopedProfileId: null,
      })
    ).toEqual(accessible);
  });

  it("narrows to chat home plus scoped vault when scoped profile is set", () => {
    expect(
      buildVaultChatRetrievalScopes({
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
        scopedProfileId: "nolan",
      })
    ).toEqual([
      { id: "personal", display_name: "Kola", profile_type: "personal" },
      { id: "nolan", display_name: "Nolan", profile_type: "child" },
    ]);
  });
});

describe("chatScopedProfilePayload", () => {
  const accessible = [
    { id: "personal", display_name: "Kola" },
    { id: "nolan", display_name: "Nolan" },
  ];

  it("returns null when scoped profile matches chat home", () => {
    expect(
      chatScopedProfilePayload({
        scopedProfileId: "personal",
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
      })
    ).toBeNull();
  });

  it("returns scoped profile metadata for follow-up UI", () => {
    expect(
      chatScopedProfilePayload({
        scopedProfileId: "nolan",
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
      })
    ).toEqual({ profileId: "nolan", profileName: "Nolan" });
  });
});
