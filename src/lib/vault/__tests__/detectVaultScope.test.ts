import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVaultChatRetrievalScopes,
  chatScopedProfilePayload,
  detectCrossVaultScope,
  detectMentionedVault,
  profileMentionedInQuestion,
  resolveExplicitSpaceScope,
  resolveGideonWriteVault,
  resolveNamedSpaceOutsideSearch,
  resolveChatMemorySpaceSuggestion,
  resolveAskSpaceAutoRoute,
  shouldClearPeerChatScope,
} from "../detectVaultScope";

const profiles = [
  { id: "personal", display_name: "Kola" },
  { id: "nolan", display_name: "Nolan" },
  { id: "emma", display_name: "Emma" },
  { id: "nolan-smith", display_name: "Nolan Smith" },
];

describe("detectVaultScope", () => {
  it("detects possessive mentions", () => {
    assert.equal(
      profileMentionedInQuestion("Check Nolan's report card", "Nolan"),
      true
    );
    assert.equal(
      profileMentionedInQuestion("show Nolans summer camp flyer", "Nolan"),
      true
    );
    assert.equal(
      profileMentionedInQuestion("When is my passport due?", "Nolan"),
      false
    );
  });

  it("detects cross-vault from possessive without apostrophe", () => {
    assert.deepEqual(
      detectCrossVaultScope({
        question: "show Nolans summer camp flyer",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      }),
      { id: "nolan", display_name: "Nolan" }
    );
  });

  it("returns a single cross-vault match", () => {
    assert.deepEqual(
      detectCrossVaultScope({
        question: "Check Nolan's report card",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      }),
      { id: "nolan", display_name: "Nolan" }
    );
  });

  it("skips profiles already in rollup scope", () => {
    assert.equal(
      detectCrossVaultScope({
        question: "Check Nolan's report card",
        activeProfileId: "family",
        inScopeProfileIds: ["family", "nolan"],
        accessibleProfiles: profiles,
      }),
      null
    );
  });

  it("returns null when multiple children match", () => {
    assert.equal(
      detectCrossVaultScope({
        question: "Compare Nolan and Emma report cards",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      }),
      null
    );
  });

  it("disambiguates with a full name mention", () => {
    assert.deepEqual(
      detectCrossVaultScope({
        question: "Open Nolan Smith's homework folder",
        activeProfileId: "personal",
        inScopeProfileIds: ["personal"],
        accessibleProfiles: profiles,
      }),
      { id: "nolan-smith", display_name: "Nolan Smith" }
    );
  });
});

describe("detectMentionedVault", () => {
  it("finds a named vault even when all vaults are in read scope", () => {
    assert.deepEqual(
      detectMentionedVault({
        question: "Check Nolan's report card",
        accessibleProfiles: profiles,
      }),
      { id: "nolan", display_name: "Nolan" }
    );
  });

  it("returns null when multiple vaults are named", () => {
    assert.equal(
      detectMentionedVault({
        question: "Compare Nolan and Emma report cards",
        accessibleProfiles: profiles,
      }),
      null
    );
  });

  it("does not match Connect With Jesus from CrossRoads Connect", () => {
    const eventProfiles = [
      {
        id: "crossroads",
        display_name: "Crossroadsconnect",
        profile_type: "event" as const,
      },
      {
        id: "cwj",
        display_name: "Connect With Jesus",
        profile_type: "hobby" as const,
      },
    ];
    assert.equal(
      profileMentionedInQuestion(
        "What do we know about CrossRoads Connect?",
        "Connect With Jesus"
      ),
      false
    );
    assert.deepEqual(
      detectMentionedVault({
        question: "What do we know about CrossRoads Connect?",
        accessibleProfiles: eventProfiles,
        preferProfileId: "crossroads",
      }),
      {
        id: "crossroads",
        display_name: "Crossroadsconnect",
        profile_type: "event",
      }
    );
    assert.deepEqual(
      resolveGideonWriteVault({
        question: "What do we know about CrossRoads Connect?",
        activeProfileId: "crossroads",
        accessibleProfiles: eventProfiles,
        retrievedChunks: [],
      }),
      {
        id: "crossroads",
        display_name: "Crossroadsconnect",
        profile_type: "event",
      }
    );
  });
});

describe("resolveNamedSpaceOutsideSearch", () => {
  it("finds Kendall Capital while searching NM2TECH only", () => {
    const spaces = [
      { id: "nm2", display_name: "NM2TECH", profile_type: "business" as const },
      {
        id: "kendall",
        display_name: "Kendall Capital",
        profile_type: "business" as const,
      },
    ];
    assert.deepEqual(
      resolveNamedSpaceOutsideSearch({
        question: "What do we know about Kendall Capital?",
        accessibleProfiles: spaces,
        currentSearchProfileIds: ["nm2"],
      }),
      {
        id: "kendall",
        display_name: "Kendall Capital",
        profile_type: "business",
      }
    );
  });

  it("matches suggested-chip phrasing Kendall Capital Management", () => {
    const spaces = [
      {
        id: "nm2b",
        display_name: "NM2TECH - Next Move",
        profile_type: "business" as const,
      },
      {
        id: "kendall",
        display_name: "Kendall Capital",
        profile_type: "business" as const,
      },
    ];
    assert.deepEqual(
      resolveNamedSpaceOutsideSearch({
        question: "What do we know about Kendall Capital Management?",
        accessibleProfiles: spaces,
        currentSearchProfileIds: ["nm2b"],
      }),
      {
        id: "kendall",
        display_name: "Kendall Capital",
        profile_type: "business",
      }
    );
  });

  it("returns null when the named Space is already in search scope", () => {
    const spaces = [
      { id: "nm2", display_name: "NM2TECH", profile_type: "business" as const },
      {
        id: "kendall",
        display_name: "Kendall Capital",
        profile_type: "business" as const,
      },
    ];
    assert.equal(
      resolveNamedSpaceOutsideSearch({
        question: "What do we know about Kendall Capital?",
        accessibleProfiles: spaces,
        currentSearchProfileIds: ["nm2", "kendall"],
      }),
      null
    );
  });
});

describe("resolveChatMemorySpaceSuggestion", () => {
  it("suggests Nolan while chatting from Mini Cooper / All spaces", () => {
    const spaces = [
      {
        id: "mini",
        display_name: "Mini Cooper",
        profile_type: "vehicle" as const,
      },
      { id: "nolan", display_name: "Nolan", profile_type: "child" as const },
    ];
    assert.deepEqual(
      resolveChatMemorySpaceSuggestion({
        question: "How did Nolan do on his spelling test?",
        activeProfileId: "mini",
        accessibleProfiles: spaces,
      }),
      { id: "nolan", display_name: "Nolan", profile_type: "child" }
    );
  });

  it("returns null when the mentioned Space is already active", () => {
    assert.equal(
      resolveChatMemorySpaceSuggestion({
        question: "How did Nolan do on his spelling test?",
        activeProfileId: "nolan",
        accessibleProfiles: profiles,
      }),
      null
    );
  });

  it("does not nudge to a longer name sharing the active Space token", () => {
    assert.equal(
      resolveChatMemorySpaceSuggestion({
        question: "Nolan's spelling list for Friday",
        activeProfileId: "nolan",
        accessibleProfiles: profiles,
      }),
      null
    );
  });

  it("honors explicit in-my-X-space phrasing", () => {
    assert.deepEqual(
      resolveChatMemorySpaceSuggestion({
        question: "In my Nolan space, what homework is due?",
        activeProfileId: "personal",
        accessibleProfiles: profiles,
      }),
      { id: "nolan", display_name: "Nolan" }
    );
  });

  it("resolves in the Tesla space without treating 'the' as the name", () => {
    const spaces = [
      { id: "nolan", display_name: "Nolan Kola", profile_type: "child" as const },
      { id: "tesla", display_name: "Tesla", profile_type: "vehicle" as const },
    ];
    assert.deepEqual(
      resolveExplicitSpaceScope({
        question: "what's in the Tesla space ?",
        accessibleProfiles: spaces,
      }),
      { id: "tesla", display_name: "Tesla", profile_type: "vehicle" }
    );
    assert.deepEqual(
      resolveChatMemorySpaceSuggestion({
        question: "what's in the Tesla space ?",
        activeProfileId: "nolan",
        accessibleProfiles: spaces,
      }),
      { id: "tesla", display_name: "Tesla", profile_type: "vehicle" }
    );
  });
});

describe("resolveAskSpaceAutoRoute", () => {
  it("promotes sticky Searching Tesla into a real switch", () => {
    const spaces = [
      { id: "nolan", display_name: "Nolan Kola", profile_type: "child" as const },
      { id: "tesla", display_name: "Tesla", profile_type: "vehicle" as const },
    ];
    assert.deepEqual(
      resolveAskSpaceAutoRoute({
        question: "whats in my tesla space",
        activeProfileId: "nolan",
        accessibleProfiles: spaces,
        stickyScopedProfile: { profileId: "tesla", profileName: "Tesla" },
      }),
      { id: "tesla", display_name: "Tesla", profile_type: "vehicle" }
    );
  });

  it("promotes sticky scope even when missing from the local profiles list", () => {
    assert.deepEqual(
      resolveAskSpaceAutoRoute({
        question: "list the files",
        activeProfileId: "nolan",
        accessibleProfiles: [
          { id: "nolan", display_name: "Nolan Kola", profile_type: "child" },
        ],
        stickyScopedProfile: { profileId: "tesla", profileName: "Tesla" },
      }),
      { id: "tesla", display_name: "Tesla" }
    );
  });
});

describe("shouldClearPeerChatScope", () => {
  it("clears peer Spaces but keeps nested child vault search", () => {
    const tree = [
      { id: "biz", parent_profile_id: null },
      { id: "payroll", parent_profile_id: "biz" },
      { id: "nolan", parent_profile_id: "family" },
      { id: "tesla", parent_profile_id: "family" },
    ];
    assert.equal(
      shouldClearPeerChatScope({
        activeProfileId: "biz",
        stickyProfileId: "payroll",
        profiles: tree,
      }),
      false
    );
    assert.equal(
      shouldClearPeerChatScope({
        activeProfileId: "nolan",
        stickyProfileId: "tesla",
        profiles: tree,
      }),
      true
    );
  });
});

describe("resolveGideonWriteVault", () => {
  it("prefers an explicit vault mention over retrieval dominance", () => {
    assert.deepEqual(
      resolveGideonWriteVault({
        question: "Remind me about Nolan's soccer game",
        activeProfileId: "personal",
        accessibleProfiles: profiles,
        retrievedChunks: [{ profile_id: "emma" }, { profile_id: "emma" }],
      }),
      { id: "nolan", display_name: "Nolan" }
    );
  });

  it("falls back to the active vault when nothing else matches", () => {
    assert.deepEqual(
      resolveGideonWriteVault({
        question: "What invoices are due?",
        activeProfileId: "personal",
        accessibleProfiles: profiles,
        retrievedChunks: [],
      }),
      { id: "personal", display_name: "Kola" }
    );
  });
});

describe("buildVaultChatRetrievalScopes", () => {
  const accessible = [
    { id: "personal", display_name: "Kola", profile_type: "personal" as const },
    { id: "nolan", display_name: "Nolan", profile_type: "child" as const },
    { id: "emma", display_name: "Emma", profile_type: "child" as const },
  ];

  it("searches all accessible vaults in global scope", () => {
    assert.deepEqual(
      buildVaultChatRetrievalScopes({
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
        scopedProfileId: null,
        searchScope: "global",
      }),
      accessible
    );
  });

  it("searches only chat home in workspace scope", () => {
    assert.deepEqual(
      buildVaultChatRetrievalScopes({
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
        scopedProfileId: null,
        searchScope: "workspace",
      }),
      [{ id: "personal", display_name: "Kola", profile_type: "personal" }]
    );
  });

  it("narrows to chat home plus scoped vault when scoped profile is set", () => {
    assert.deepEqual(
      buildVaultChatRetrievalScopes({
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
        scopedProfileId: "nolan",
      }),
      [
        { id: "personal", display_name: "Kola", profile_type: "personal" },
        { id: "nolan", display_name: "Nolan", profile_type: "child" },
      ]
    );
  });
});

describe("chatScopedProfilePayload", () => {
  const accessible = [
    { id: "personal", display_name: "Kola" },
    { id: "nolan", display_name: "Nolan" },
  ];

  it("returns null when scoped profile matches chat home", () => {
    assert.equal(
      chatScopedProfilePayload({
        scopedProfileId: "personal",
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
      }),
      null
    );
  });

  it("returns scoped profile metadata for follow-up UI", () => {
    assert.deepEqual(
      chatScopedProfilePayload({
        scopedProfileId: "nolan",
        accessibleProfiles: accessible,
        chatHomeProfileId: "personal",
      }),
      { profileId: "nolan", profileName: "Nolan" }
    );
  });

  it("resolves an explicit space scope from the question", () => {
    const scopedProfiles = [
      { id: "personal", display_name: "Personal" },
      { id: "nolan", display_name: "Nolan" },
      { id: "biz", display_name: "NM2TECH" },
    ];
    assert.deepEqual(
      resolveExplicitSpaceScope({
        question: "What do I have in my Personal space about Nolan?",
        accessibleProfiles: scopedProfiles,
      }),
      { id: "personal", display_name: "Personal" }
    );
    assert.deepEqual(
      resolveExplicitSpaceScope({
        question: "What do I have in my Personal space about Nolan?",
        accessibleProfiles: [
          {
            id: "mk-personal",
            display_name: "Michael Kola",
            profile_type: "personal",
          },
          { id: "nolan", display_name: "Nolan Kola", profile_type: "child" },
        ],
      }),
      {
        id: "mk-personal",
        display_name: "Michael Kola",
        profile_type: "personal",
      }
    );
    assert.deepEqual(
      resolveExplicitSpaceScope({
        question: "Show files in Nolan's space",
        accessibleProfiles: scopedProfiles,
      }),
      { id: "nolan", display_name: "Nolan" }
    );
    assert.equal(
      resolveExplicitSpaceScope({
        question: "What happened today?",
        accessibleProfiles: scopedProfiles,
      }),
      null
    );
  });
});
