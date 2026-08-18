import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGideonSuggestions,
  buildGideonVaultGuidance,
  buildVaultScopeNote,
  buildGideonTodayNote,
  buildCurrentTimeAnswer,
  buildTodayDateAnswer,
  isSimpleCurrentTimeQuestion,
  isSimpleTodayDateQuestion,
  firstNameFrom,
  buildListAnswerFromChunks,
  getVaultTemplate,
  gideonChatContextLabel,
  parseGideonSections,
  withVaultPersonality,
  chartSuggestionTitle,
  GIDEON_SYSTEM,
  GIDEON_ATTACHED_DOCUMENT_NOTE,
  GIDEON_VISION_NOTE,
  GIDEON_BRAND_LINE,
  EMPTY_VAULT_HEADLINE,
  EMPTY_VAULT_BODY,
  VAULT_SCOPE_NOTE,
  TRY_GUARDIAN_EXAMPLES,
  ORGANIZE_EXAMPLES,
  PRIVACY_CARD_POINTS,
} from "../gideon.ts";
import { defaultGideonWriteProfileId } from "../detectVaultScope.ts";

describe("Gideon helpers", () => {
  it("exposes brand line and system identity", () => {
    assert.match(GIDEON_SYSTEM, /You are Gideon/);
    assert.match(GIDEON_SYSTEM, /Payment status is unknown/);
    assert.match(GIDEON_SYSTEM, /GENERAL KNOWLEDGE/);
    assert.match(GIDEON_SYSTEM, /Never invent typical chords for a key/i);
    assert.match(GIDEON_SYSTEM, /chord-chart images/i);
    assert.match(GIDEON_SYSTEM, /chord-over-lyric/i);
    assert.match(GIDEON_SYSTEM, /Never invent chords or lyrics/i);
    assert.match(GIDEON_SYSTEM, /treat them as files in this space/i);
    assert.match(GIDEON_SYSTEM, /analyzed Trello chart/i);
    assert.match(GIDEON_SYSTEM, /Never say you lack a JPG\/PDF/i);
    assert.match(GIDEON_SYSTEM, /including a key suffix/i);
    assert.match(GIDEON_SYSTEM, /YOUTUBE:/i);
    assert.match(GIDEON_SYSTEM, /CURRENT DATE AND TIME is provided/i);
    assert.match(GIDEON_SYSTEM, /never ask them to re-upload/i);
    assert.match(GIDEON_ATTACHED_DOCUMENT_NOTE, /Never ask the user to re-upload/i);
    assert.match(GIDEON_VISION_NOTE, /Never say you cannot see an image/i);
    assert.equal(
      GIDEON_BRAND_LINE,
      "Guardian watches. Gideon explains. You decide."
    );
  });

  it("builds today's date note for vault chat", () => {
    const note = buildGideonTodayNote(
      new Date("2026-07-25T15:00:00-04:00")
    );
    assert.match(note, /CURRENT DATE AND TIME \(authoritative\)/);
    assert.match(note, /Saturday, July 25, 2026/);
    assert.match(note, /3:00 PM/);
    assert.match(note, /Eastern Time/);
    assert.match(note, /do not say you lack real-time date or time access/i);
  });

  it("detects simple today-date questions", () => {
    assert.equal(isSimpleTodayDateQuestion("what is today's date"), true);
    assert.equal(isSimpleTodayDateQuestion("what is today date"), true);
    assert.equal(isSimpleTodayDateQuestion("what day is it"), true);
    assert.equal(
      isSimpleTodayDateQuestion("what us today July 25th which day"),
      false
    );
    assert.equal(
      isSimpleTodayDateQuestion("summarize my vault documents"),
      false
    );
  });

  it("builds a direct today-date answer", () => {
    const answer = buildTodayDateAnswer(
      "Asia/Kolkata",
      new Date("2026-07-25T15:00:00+05:30")
    );
    assert.match(answer, /Today is Saturday, July 25, 2026/);
    assert.match(answer, /India Standard Time/);
  });

  it("detects simple current-time questions", () => {
    assert.equal(isSimpleCurrentTimeQuestion("time?"), true);
    assert.equal(isSimpleCurrentTimeQuestion("what time is it"), true);
    assert.equal(isSimpleCurrentTimeQuestion("what's the time"), true);
    assert.equal(isSimpleCurrentTimeQuestion("what time is my reminder"), false);
    assert.equal(isSimpleCurrentTimeQuestion("what timezone am I in"), false);
  });

  it("builds a direct current-time answer", () => {
    const answer = buildCurrentTimeAnswer(
      "America/New_York",
      new Date("2026-07-25T15:00:00-04:00")
    );
    assert.match(answer, /The current time is 3:00 PM/);
    assert.match(answer, /Eastern Time/);
  });

  it("parses first name from full name", () => {
    assert.equal(firstNameFrom("Ada Lovelace"), "Ada");
    assert.equal(firstNameFrom("  "), null);
    assert.equal(firstNameFrom(null), null);
  });

  it("only suggests invoice questions when invoices exist", () => {
    const plain = buildGideonSuggestions([
      { documentType: "other", fileName: "notes.pdf" },
    ]);
    assert.ok(!plain.some((q) => /invoice|receive/i.test(q)));

    const withInvoice = buildGideonSuggestions([
      { documentType: "invoice", guardianStatus: "upcoming", fileName: "inv.pdf" },
    ]);
    assert.ok(withInvoice.some((q) => /receive|invoice/i.test(q)));
    assert.ok(withInvoice.some((q) => /attention/i.test(q)));
    assert.ok(withInvoice.length <= 5);
  });

  it("returns no suggestions for an empty vault", () => {
    assert.deepEqual(buildGideonSuggestions([]), []);
  });

  it("suggests song and chord chips for music spaces and analyzed charts", () => {
    const bySpace = buildGideonSuggestions([], "personal", {
      spaceName: "Wednesday Practice",
    });
    assert.ok(bySpace.some((q) => /songs|chord|practice/i.test(q)));
    assert.ok(!bySpace.some((q) => /invoice/i.test(q)));

    const byCharts = buildGideonSuggestions([], "business", {
      spaceName: "Acme Ops",
      boardName: "The Living Waters",
      hasConnectedCharts: true,
      songTitles: ["Silent Night Holy Night", "Ibadat Karo", "Just As I Am"],
    });
    assert.ok(byCharts.some((q) => /Living Waters/i.test(q)));
    assert.ok(byCharts.some((q) => /chords for Silent Night/i.test(q)));
    assert.ok(byCharts.some((q) => /Chords and lyrics for Silent Night/i.test(q)));
    assert.ok(!byCharts.some((q) => /invoice/i.test(q)));
    assert.ok(byCharts.length <= 5);
  });

  it("does not suggest chords for business files on a business space", () => {
    const biz = buildGideonSuggestions(
      [{ documentType: "other", fileName: "notes.pdf" }],
      "business",
      {
        spaceName: "NM2TECH - Next Move",
        songTitles: ["WMOI OCTOBER 2021 FINANCIAL HELP REPORT"],
        hasConnectedCharts: false,
      }
    );
    assert.ok(biz.some((q) => /employees|clients|attention/i.test(q)));
    assert.ok(!biz.some((q) => /songs?|chord|practice/i.test(q)));
  });

  it("does not invent invoice chips for business spaces without invoices", () => {
    const biz = buildGideonSuggestions(
      [{ documentType: "other", fileName: "notes.pdf" }],
      "business"
    );
    assert.ok(biz.some((q) => /employees|clients|attention/i.test(q)));
    assert.ok(!biz.some((q) => /invoice|contracts need/i.test(q)));
  });

  it("cleans chart titles for suggestion chips", () => {
    assert.equal(
      chartSuggestionTitle({
        cardName: "Silent Night Holy Night - C",
        name: "Silent Night Holy Night - C.jpg",
      }),
      "Silent Night Holy Night"
    );
  });

  it("returns trust-first onboarding guidance for empty vaults", () => {
    const guide = buildGideonVaultGuidance("teacher", "Ms. Rivera");
    const teacher = getVaultTemplate("teacher");
    assert.equal(guide.headline, teacher.welcomeTitle);
    assert.equal(guide.intro, teacher.description);
    assert.equal(guide.badge, "🏫 Teacher");
    assert.equal(guide.label, "Teacher");
    assert.deepEqual(guide.suggestedUploads, [...teacher.suggestedUploads]);
    assert.deepEqual(guide.suggestions, [...teacher.starterQuestions]);
    assert.ok(guide.suggestedUploads.some((t) => /Lesson|Curriculum|Notes/i.test(t)));
    assert.ok(!guide.suggestedUploads.some((t) => /\bIDs?\b|passport|SSN/i.test(t)));
  });

  it("keeps personal onboarding free of identity-document pressure", () => {
    const guide = buildGideonVaultGuidance("personal");
    const personal = getVaultTemplate("personal");
    assert.equal(guide.headline, personal.welcomeTitle);
    assert.equal(guide.intro, personal.description);
    assert.ok(!guide.suggestions.some((q) => /passport|driver'?s license|SSN/i.test(q)));
    assert.ok(
      !guide.suggestedUploads.some((u) =>
        /passport|driver|license|SSN|social security|tax return/i.test(u)
      )
    );
    assert.ok(
      !TRY_GUARDIAN_EXAMPLES.some((e) =>
        /passport|driver|license|SSN|social security|tax return/i.test(e)
      )
    );
    assert.ok(ORGANIZE_EXAMPLES.some((e) => /if you choose/i.test(e)));
    assert.ok(PRIVACY_CARD_POINTS.length >= 4);
    assert.equal(EMPTY_VAULT_HEADLINE, "Add something for Gideon to remember");
    assert.match(EMPTY_VAULT_BODY, /something simple/i);
    assert.equal(gideonChatContextLabel("personal"), "You are chatting with Gideon Personal");
    assert.equal(
      gideonChatContextLabel("non_profit"),
      "You are chatting with Gideon Nonprofit"
    );
    assert.equal(
      gideonChatContextLabel("child", "Nolan"),
      "You are chatting with Gideon in Nolan's space"
    );
    assert.equal(
      gideonChatContextLabel("child", "James"),
      "You are chatting with Gideon in James' space"
    );
    assert.equal(
      gideonChatContextLabel("family", "Smith Family"),
      "You are chatting with Gideon · Smith Family"
    );
    assert.equal(
      VAULT_SCOPE_NOTE,
      "Searching all your spaces."
    );
    assert.equal(
      buildVaultScopeNote({ displayName: "Nolan", profileKind: "child" }),
      "Searching only Nolan's space."
    );
    assert.equal(
      buildVaultScopeNote({
        allVaultNames: ["Personal", "Business", "Nolan"],
      }),
      "Searching all 3 spaces: Personal, Business, Nolan."
    );
    assert.equal(
      buildVaultScopeNote({
        allVaultNames: [
          "crossroadconnect",
          "Michael Kola",
          "NM2TECH - Next Move",
          "Matthew Kola",
        ],
        searchVaultNames: [
          "crossroadconnect",
          "Michael Kola",
          "NM2TECH - Next Move",
          "Matthew Kola",
        ],
        chatScopedProfileName: "NM2TECH - Next Move",
      }),
      "Answers may use all 4 spaces · Chat saved in NM2TECH - Next Move."
    );
    assert.equal(
      buildVaultScopeNote({
        allVaultNames: [
          "JAKULLA",
          "crossroadconnect",
          "CROSSROADS",
          "SHEFA",
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
          "H",
        ],
        searchVaultNames: ["crossroadconnect", "CROSSROADS"],
        chatScopedProfileName: "CROSSROADS",
      }),
      "Searching 2 spaces for this chat: crossroadconnect, CROSSROADS (12 spaces available)."
    );
    assert.equal(
      buildVaultScopeNote({
        displayName: "Family",
        profileKind: "family",
        linkedMemberNames: ["Nolan", "Ava"],
      }),
      "Searching this space and linked members: Nolan, Ava."
    );
    assert.equal(
      buildVaultScopeNote({
        allVaultNames: ["Personal", "Business", "Nolan"],
        searchVaultNames: ["Personal", "Business", "Nolan"],
        searchScope: "global",
      }),
      "Searching all your spaces: Personal, Business, Nolan."
    );
  });

  it("appends vault personality to the system prompt", () => {
    const system = withVaultPersonality(GIDEON_SYSTEM, "business");
    assert.match(system, /You are Gideon/);
    assert.match(system, /Gideon Business/);
    assert.equal(getVaultTemplate("business").label, "Business");
  });

  it("parses Gideon response sections", () => {
    const sections = parseGideonSections(`## FROM YOUR DOCUMENTS
Due date is August 5, 2026.

## FROM YOUR DAILY LOG
You recorded a follow-up on July 13.

## FROM YOUR PROFILES
2 employees are linked to this business in Guardian.

## CALCULATED
3 days remaining.

## GENERAL KNOWLEDGE
This is general knowledge, not from your Guardian vault: a W-2 reports wages.

## GIDEON'S SUGGESTION
Confirm the amount before paying.

## NEEDS VERIFICATION
Payment status is unclear.`);

    assert.equal(sections.length, 7);
    assert.equal(sections[0]?.kind, "from_documents");
    assert.equal(sections[1]?.kind, "from_daily_log");
    assert.equal(sections[2]?.kind, "from_profiles");
    assert.equal(sections[3]?.kind, "calculated");
    assert.equal(sections[4]?.kind, "general_knowledge");
    assert.equal(sections[5]?.kind, "suggestion");
    assert.equal(sections[6]?.kind, "needs_verification");
    assert.match(sections[0]!.content, /August 5/);
    assert.match(sections[2]!.content, /2 employees/);
    assert.match(sections[4]!.content, /W-2/);
  });

  it("treats plain answers as a single body section", () => {
    const sections = parseGideonSections(
      "I couldn't find that information in your current vault."
    );
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.kind, "body");
  });

  it("builds a numbered roster from retrieved fact lines", () => {
    const answer = buildListAnswerFromChunks([
      {
        file_name: "roster.jpg",
        content: `Document: roster.jpg
Title: Member Roster
Facts:
- Person: Ada Lovelace
- Person: Alan Turing
- Member: Grace Hopper`,
      },
    ]);
    assert.match(answer ?? "", /Member Roster/);
    assert.match(answer ?? "", /1\. Ada Lovelace/);
    assert.match(answer ?? "", /3\. Grace Hopper/);
  });
});

describe("defaultGideonWriteProfileId", () => {
  it("prefers chat-scoped nested vault over chat home", () => {
    assert.equal(
      defaultGideonWriteProfileId({
        activeProfileId: "biz",
        chatHomeProfileId: "biz",
        chatScopedProfileId: "crossroads",
      }),
      "crossroads"
    );
  });

  it("uses active when scoped matches home or is unset", () => {
    assert.equal(
      defaultGideonWriteProfileId({
        activeProfileId: "personal",
        chatHomeProfileId: "personal",
        chatScopedProfileId: null,
      }),
      "personal"
    );
    assert.equal(
      defaultGideonWriteProfileId({
        activeProfileId: "personal",
        chatHomeProfileId: "personal",
        chatScopedProfileId: "personal",
      }),
      "personal"
    );
  });
});
