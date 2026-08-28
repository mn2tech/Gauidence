import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerFromPersonalKnowledge,
  applyKnowledgeCorrection,
  buildKnowledgeHealth,
  buildPersonalSpaceWelcome,
  classifyResponseDepth,
  dedupeVehicles,
  extractPersonalKnowledgeFromText,
  ingestUtterances,
  PERSONAL_SPACE_DISPLAY_NAME,
  pickGapSuggestion,
  runAllTestLabCases,
  shouldSuggestBusinessSpace,
  visibleCategories,
} from "../index";

describe("Personal Space — onboarding", () => {
  it("1.1 shows welcome with three actions and no create form", () => {
    const w = buildPersonalSpaceWelcome({
      hasPersonalSpace: true,
      isEmptySpace: true,
      isNewUser: true,
      spaceDisplayName: PERSONAL_SPACE_DISPLAY_NAME,
    });
    assert.equal(w.showWelcome, true);
    assert.equal(w.skipCreateSpaceForm, true);
    assert.equal(w.actions.length, 3);
    assert.equal(w.actions[0]?.id, "add-something");
    assert.ok(w.actions.some((a) => a.label === "Ask Gideon"));
  });

  it("1.2 does not imply duplicate creation for returning users", () => {
    const w = buildPersonalSpaceWelcome({
      hasPersonalSpace: true,
      isEmptySpace: false,
      isNewUser: false,
    });
    assert.equal(w.skipCreateSpaceForm, true);
  });
});

describe("Personal Space — conversation extraction", () => {
  it("2.1 extracts person, org, works_at", () => {
    const r = extractPersonalKnowledgeFromText(
      "My name is John Smith and I work for ABC Consulting."
    );
    assert.ok(r.entities.some((e) => e.name === "John Smith" && e.kind === "person"));
    assert.ok(
      r.entities.some(
        (e) => e.name === "ABC Consulting" && e.kind === "organization"
      )
    );
    assert.ok(
      r.relationships.some(
        (x) =>
          x.predicate === "works_at" &&
          x.object === "ABC Consulting" &&
          x.subject === "John Smith"
      )
    );
  });

  it("2.2 extracts multiple vehicles with owns", () => {
    const r = extractPersonalKnowledgeFromText(
      "I have a Toyota Highlander and a Mini Cooper."
    );
    const vehicles = r.entities.filter((e) => e.kind === "vehicle");
    assert.equal(vehicles.length, 2);
    assert.equal(r.relationships.filter((x) => x.predicate === "owns").length, 2);
  });

  it("2.3 asks before confirming uncertain year", () => {
    const r = extractPersonalKnowledgeFromText(
      "I think my Highlander is a 2021."
    );
    assert.ok(r.confirmations.length >= 1);
    assert.ok(!r.facts.some((f) => f.predicate === "model_year" && f.status === "confirmed"));
  });

  it("4.1 extracts commitment", () => {
    const r = extractPersonalKnowledgeFromText(
      "I told Sarah I would send her the contract Friday."
    );
    assert.ok(r.entities.some((e) => e.name === "Sarah"));
    assert.ok(r.entities.some((e) => /contract/i.test(e.name) && e.kind === "commitment"));
    assert.ok(r.facts.some((f) => f.value === "Friday"));
  });

  it("4.2 extracts accountant relationship", () => {
    const r = extractPersonalKnowledgeFromText("David is my accountant.");
    assert.ok(
      r.relationships.some(
        (x) => x.predicate === "accountant" && x.object === "David"
      )
    );
  });

  it("4.3 extracts dental event", () => {
    const r = extractPersonalKnowledgeFromText(
      "My dental appointment is September 12 at 2 PM."
    );
    const event = r.entities.find((e) => e.kind === "event");
    assert.ok(event);
    assert.equal(event!.name, "Dental Appointment");
    assert.equal(event!.attributes?.date, "September 12");
    assert.match(event!.attributes?.time ?? "", /2\s*PM/i);
  });

  it("5.1 saves wife relationship", () => {
    const r = extractPersonalKnowledgeFromText("My wife is Jennifer.");
    assert.ok(
      r.relationships.some(
        (x) => x.object === "Jennifer" && x.status === "confirmed"
      )
    );
  });

  it("5.2 asks about uncertain birthday", () => {
    const r = extractPersonalKnowledgeFromText(
      "I think Jennifer's birthday is May 14."
    );
    assert.ok(r.confirmations.length >= 1);
  });

  it("5.3 does not confirm weak accountant", () => {
    const r = extractPersonalKnowledgeFromText(
      "Someone named David may be handling accounting."
    );
    assert.ok(
      !r.relationships.some(
        (x) => x.predicate === "accountant" && x.status === "confirmed"
      )
    );
  });
});

describe("Personal Space — retrieval and depth", () => {
  it("7.1 answers known vehicle without oversharing", () => {
    const store = ingestUtterances(["I have a Toyota Highlander."]);
    const ans = answerFromPersonalKnowledge("What car do I have?", store, {
      depth: 1,
    });
    assert.match(ans.text, /Toyota Highlander/i);
    assert.doesNotMatch(ans.text, /spec|recall|history/i);
  });

  it("7.2 refuses unknown passport", () => {
    const ans = answerFromPersonalKnowledge(
      "When does my passport expire?",
      ingestUtterances([])
    );
    assert.match(ans.text, /don't have/i);
  });

  it("8.1 depth 1 dental answer", () => {
    const store = ingestUtterances([
      "My dental appointment is September 12 at 2 PM.",
    ]);
    assert.equal(classifyResponseDepth("When is my dental appointment?"), 1);
    const ans = answerFromPersonalKnowledge(
      "When is my dental appointment?",
      store,
      { depth: 1 }
    );
    assert.match(ans.text, /September 12/);
    assert.doesNotMatch(ans.text, /prepar/i);
  });

  it("16 hallucination passport number", () => {
    const ans = answerFromPersonalKnowledge(
      "What is my passport number?",
      ingestUtterances([])
    );
    assert.match(ans.text, /don't have your passport number/i);
  });

  it("16 contradiction correction", () => {
    let store = ingestUtterances(["I have a Toyota Highlander."]);
    store = applyKnowledgeCorrection(store, {
      subject: "Toyota Highlander",
      predicate: "model_year",
      newValue: "2020",
    });
    const ans = answerFromPersonalKnowledge(
      "What year is my Highlander?",
      store
    );
    assert.equal(ans.text, "2020");
  });

  it("dedupes vehicles", () => {
    let store = ingestUtterances([
      "I have a Toyota Highlander.",
      "I own a Toyota Highlander.",
    ]);
    store = dedupeVehicles(store);
    assert.equal(store.entities.filter((e) => e.kind === "vehicle").length, 1);
  });
});

describe("Personal Space — health, gaps, expansion", () => {
  it("hides empty vehicle category", () => {
    assert.deepEqual(visibleCategories({}), []);
    assert.ok(visibleCategories({ vehicles: 1 }).includes("vehicles"));
  });

  it("suggests school grouping", () => {
    const s = pickGapSuggestion(ingestUtterances([]), {
      schoolDocumentCount: 3,
    });
    assert.match(s?.message ?? "", /same school/i);
  });

  it("does not suggest business space for one card", () => {
    const r = shouldSuggestBusinessSpace({
      businessDocumentCount: 1,
      businessQuestionCount: 0,
      organizationName: "NM2TECH",
    });
    assert.equal(r.suggest, false);
  });

  it("suggests business space when substantial", () => {
    const r = shouldSuggestBusinessSpace({
      businessDocumentCount: 15,
      businessQuestionCount: 5,
      organizationName: "NM2TECH",
    });
    assert.equal(r.suggest, true);
  });

  it("builds knowledge health", () => {
    const health = buildKnowledgeHealth({
      store: ingestUtterances([
        "My name is John.",
        "I have a Toyota Highlander.",
      ]),
      documentCount: 2,
    });
    assert.ok(["Getting started", "Growing", "Strong"].includes(health.label));
    assert.equal(health.counts.vehicles, 1);
  });
});

describe("Personal Space — e2e acceptance + test lab", () => {
  it("15 end-to-end sequence", () => {
    const store = ingestUtterances([
      "My name is John Smith.",
      "I have a Toyota Highlander.",
      "My Highlander needs an oil change on October 15.",
      "Sarah Johnson is my accountant.",
    ]);
    assert.match(
      answerFromPersonalKnowledge("What car do I own?", store).text,
      /Toyota Highlander/i
    );
    assert.match(
      answerFromPersonalKnowledge("When is my next oil change?", store).text,
      /October 15/i
    );
    assert.match(
      answerFromPersonalKnowledge("Who is Sarah?", store).text,
      /accountant/i
    );
  });

  it("runs the Knowledge Test Lab suite", () => {
    const { results, failed } = runAllTestLabCases();
    const failures = results.filter((r) => !r.pass);
    assert.equal(
      failed,
      0,
      failures.map((f) => `${f.id} ${f.name}: ${f.actual}`).join("\n")
    );
  });
});
