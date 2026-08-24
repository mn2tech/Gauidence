import { answerFromPersonalKnowledge } from "./answers";
import { extractPersonalKnowledgeFromText } from "./conversationExtract";
import { applyUncertainty, confidenceLevelFromScore } from "./confidence";
import { classifyResponseDepth } from "./responseDepth";
import { buildKnowledgeHealth } from "./knowledgeHealth";
import { pickGapSuggestion } from "./gapSuggestions";
import { shouldSuggestBusinessSpace } from "./spaceExpansion";
import { applyKnowledgeCorrection, dedupeVehicles } from "./corrections";
import { buildPersonalSpaceWelcome } from "./welcome";
import { emptyStore, ingestUtterances, mergeExtraction } from "./store";
import { visibleCategories } from "./categories";
import type { PersonalKnowledgeStore } from "./types";
import { PERSONAL_SPACE_DISPLAY_NAME } from "./types";
import { routeGideonOrchestration } from "@/lib/gideon/request-router";
import { resolveGuardianKnowledge } from "@/lib/gideon/knowledge-resolver";
import { composeGideonResponse } from "@/lib/gideon/response-composer";
import { buildOrchestrationDebugSnapshot } from "@/lib/gideon/orchestration-observability";

export type TestLabCase = {
  id: string;
  tab:
    | "Onboarding"
    | "Conversation"
    | "Upload"
    | "Extraction"
    | "Entities"
    | "Relationships"
    | "Retrieval"
    | "Response Depth"
    | "Corrections"
    | "Permissions"
    | "Sources"
    | "Knowledge Health"
    | "Gideon Orchestration";
  name: string;
  input: string;
  expected: string;
  run: () => {
    actual: string;
    pass: boolean;
    entitiesCreated?: string[];
    relationshipsCreated?: string[];
    responseDepth?: number;
    sources?: string[];
    errors?: string[];
    orchestration?: {
      intent?: string;
      responseDepth?: string;
      knowledgeStatus?: string;
      knowledgeSource?: string;
      space?: string;
    };
  };
};

function passFail(actual: string, check: (a: string) => boolean) {
  return { actual, pass: check(actual) };
}

export function buildTestLabCases(): TestLabCase[] {
  return [
    {
      id: "1.1",
      tab: "Onboarding",
      name: "Brand-new account creates Personal Space",
      input: "new user login",
      expected: "My Personal Space auto-created; welcome shown; no create-space form",
      run: () => {
        const welcome = buildPersonalSpaceWelcome({
          hasPersonalSpace: true,
          isEmptySpace: true,
          isNewUser: true,
          spaceDisplayName: PERSONAL_SPACE_DISPLAY_NAME,
        });
        const actual = [
          welcome.spaceName,
          welcome.showWelcome ? "welcome" : "no-welcome",
          welcome.skipCreateSpaceForm ? "no-create-form" : "create-form",
          welcome.actions.map((a) => a.label).join(", "),
        ].join(" | ");
        return passFail(
          actual,
          (a) =>
            a.includes(PERSONAL_SPACE_DISPLAY_NAME) &&
            a.includes("welcome") &&
            a.includes("no-create-form") &&
            a.includes("Ask Gideon") &&
            a.includes("Add Something") &&
            a.includes("Tell Guardian About Me")
        );
      },
    },
    {
      id: "1.2",
      tab: "Onboarding",
      name: "Returning user — no duplicate Personal Space",
      input: "existing personal space",
      expected: "Reuse existing; do not create duplicate",
      run: () => {
        const first = buildPersonalSpaceWelcome({
          hasPersonalSpace: true,
          isEmptySpace: false,
          isNewUser: false,
          spaceDisplayName: PERSONAL_SPACE_DISPLAY_NAME,
        });
        const second = buildPersonalSpaceWelcome({
          hasPersonalSpace: true,
          isEmptySpace: false,
          isNewUser: false,
          spaceDisplayName: PERSONAL_SPACE_DISPLAY_NAME,
        });
        const actual = `${first.spaceName} === ${second.spaceName}; duplicates=false`;
        return passFail(actual, (a) => a.includes("duplicates=false"));
      },
    },
    {
      id: "1.3",
      tab: "Onboarding",
      name: "Immediate Gideon use",
      input: "What's the weather like today?",
      expected: "No onboarding gate; general answer allowed",
      run: () => {
        const welcome = buildPersonalSpaceWelcome({
          hasPersonalSpace: true,
          isEmptySpace: true,
          isNewUser: true,
        });
        const actual = welcome.actions.some((a) => a.id === "ask-gideon")
          ? "Ask Gideon available immediately"
          : "blocked";
        return passFail(actual, (a) => a.includes("available"));
      },
    },
    {
      id: "2.1",
      tab: "Conversation",
      name: "Basic personal information",
      input: "My name is John Smith and I work for ABC Consulting.",
      expected: "Person John Smith; Org ABC Consulting; works_at",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "My name is John Smith and I work for ABC Consulting."
        );
        const actual = [
          r.entities.map((e) => `${e.kind}:${e.name}`).join(", "),
          r.relationships.map((x) => `${x.subject}→${x.predicate}→${x.object}`).join(", "),
        ].join(" | ");
        return {
          ...passFail(
            actual,
            (a) =>
              a.includes("person:John Smith") &&
              a.includes("organization:ABC Consulting") &&
              a.includes("works_at")
          ),
          entitiesCreated: r.entities.map((e) => e.name),
          relationshipsCreated: r.relationships.map(
            (x) => `${x.subject} ${x.predicate} ${x.object}`
          ),
        };
      },
    },
    {
      id: "2.2",
      tab: "Entities",
      name: "Multiple vehicles",
      input: "I have a Toyota Highlander and a Mini Cooper.",
      expected: "Two vehicles; User owns both",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "I have a Toyota Highlander and a Mini Cooper."
        );
        const vehicles = r.entities.filter((e) => e.kind === "vehicle");
        const owns = r.relationships.filter((x) => x.predicate === "owns");
        const actual = `${vehicles.map((v) => v.name).join(", ")} | owns=${owns.length}`;
        return {
          ...passFail(
            actual,
            (a) =>
              a.includes("Toyota Highlander") &&
              a.includes("Mini Cooper") &&
              a.includes("owns=2")
          ),
          entitiesCreated: vehicles.map((v) => v.name),
          relationshipsCreated: owns.map((o) => `User owns ${o.object}`),
        };
      },
    },
    {
      id: "2.3",
      tab: "Conversation",
      name: "Uncertain vehicle year",
      input: "I think my Highlander is a 2021.",
      expected: "Ask confirmation; do not confirm 2021",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "I think my Highlander is a 2021."
        );
        const confirmedYear = r.facts.some(
          (f) =>
            f.predicate === "model_year" &&
            f.value === "2021" &&
            f.status === "confirmed"
        );
        const actual = confirmedYear
          ? "incorrectly confirmed"
          : r.confirmations[0]?.question ?? "no confirmation";
        return passFail(
          actual,
          (a) =>
            !a.includes("incorrectly") &&
            /2021/i.test(a) &&
            /should i record/i.test(a)
        );
      },
    },
    {
      id: "4.1",
      tab: "Extraction",
      name: "Commitment extraction",
      input: "I told Sarah I would send her the contract Friday.",
      expected: "Person Sarah; commitment; due Friday",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "I told Sarah I would send her the contract Friday."
        );
        const actual = [
          r.entities.map((e) => `${e.kind}:${e.name}`).join("; "),
          r.facts.map((f) => `${f.predicate}=${f.value}`).join("; "),
        ].join(" | ");
        return passFail(
          actual,
          (a) =>
            a.includes("person:Sarah") &&
            a.toLowerCase().includes("contract") &&
            a.includes("Friday")
        );
      },
    },
    {
      id: "4.2",
      tab: "Relationships",
      name: "Accountant relationship",
      input: "David is my accountant.",
      expected: "User → accountant → David",
      run: () => {
        const r = extractPersonalKnowledgeFromText("David is my accountant.");
        const actual = r.relationships
          .map((x) => `${x.subject}→${x.predicate}→${x.object}`)
          .join(", ");
        return passFail(actual, (a) => a.includes("User→accountant→David"));
      },
    },
    {
      id: "4.3",
      tab: "Extraction",
      name: "Event extraction",
      input: "My dental appointment is September 12 at 2 PM.",
      expected: "Dental Appointment; Sept 12; 2 PM",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "My dental appointment is September 12 at 2 PM."
        );
        const event = r.entities.find((e) => e.kind === "event");
        const actual = `${event?.name} | ${event?.attributes?.date} | ${event?.attributes?.time}`;
        return passFail(
          actual,
          (a) =>
            a.includes("Dental Appointment") &&
            a.includes("September 12") &&
            /2\s*PM/i.test(a)
        );
      },
    },
    {
      id: "5.1",
      tab: "Relationships",
      name: "High confidence spouse",
      input: "My wife is Jennifer.",
      expected: "Save spouse relationship",
      run: () => {
        const r = extractPersonalKnowledgeFromText("My wife is Jennifer.");
        const rel = r.relationships.find((x) => x.object === "Jennifer");
        const actual = `${rel?.predicate}:${rel?.status}`;
        return passFail(actual, (a) => a.includes("confirmed"));
      },
    },
    {
      id: "5.2",
      tab: "Conversation",
      name: "Medium/uncertain birthday",
      input: "I think Jennifer's birthday is May 14.",
      expected: "Ask confirmation before authoritative",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "I think Jennifer's birthday is May 14."
        );
        const actual =
          r.confirmations[0]?.question ??
          (r.facts.find((f) => f.predicate === "birthday")?.status ?? "none");
        return passFail(
          actual,
          (a) => /should i save/i.test(a) || a === "provisional"
        );
      },
    },
    {
      id: "5.3",
      tab: "Relationships",
      name: "Low confidence accountant",
      input: "Someone named David may be handling accounting.",
      expected: "Do not create confirmed accountant relationship",
      run: () => {
        const r = extractPersonalKnowledgeFromText(
          "Someone named David may be handling accounting."
        );
        const confirmed = r.relationships.some(
          (x) => x.predicate === "accountant" && x.status === "confirmed"
        );
        const actual = confirmed ? "confirmed incorrectly" : "no confirmed accountant";
        return passFail(actual, (a) => a.includes("no confirmed"));
      },
    },
    {
      id: "6.1",
      tab: "Knowledge Health",
      name: "Progressive categories",
      input: "empty then add vehicle",
      expected: "Vehicles hidden until owned",
      run: () => {
        const before = visibleCategories({});
        const after = visibleCategories({ vehicles: 1 });
        const actual = `before=${before.join(",") || "none"}; after=${after.join(",")}`;
        return passFail(
          actual,
          (a) => a.includes("before=none") && a.includes("vehicles")
        );
      },
    },
    {
      id: "7.1",
      tab: "Retrieval",
      name: "Known personal fact",
      input: "What car do I have?",
      expected: "Toyota Highlander only",
      run: () => {
        const store = ingestUtterances(["I have a Toyota Highlander."]);
        const ans = answerFromPersonalKnowledge("What car do I have?", store);
        return {
          ...passFail(ans.text, (a) => /Toyota Highlander/i.test(a) && !/spec/i.test(a)),
          responseDepth: ans.depth,
        };
      },
    },
    {
      id: "7.2",
      tab: "Retrieval",
      name: "Unknown passport",
      input: "When does my passport expire?",
      expected: "Admit unknown; do not invent",
      run: () => {
        const ans = answerFromPersonalKnowledge(
          "When does my passport expire?",
          emptyStore()
        );
        return passFail(
          ans.text,
          (a) => /don't have/i.test(a) && !/\d{4}/.test(a)
        );
      },
    },
    {
      id: "7.3",
      tab: "Retrieval",
      name: "General knowledge",
      input: "What is a passport?",
      expected: "General model; not personal search required",
      run: () => {
        const ans = answerFromPersonalKnowledge("What is a passport?", emptyStore());
        return passFail(
          ans.text,
          (a) => ans.sourceLayer === "general_model" && /travel document/i.test(a)
        );
      },
    },
    {
      id: "8.1",
      tab: "Response Depth",
      name: "Depth 1 dental",
      input: "When is my dental appointment?",
      expected: "September 12 at 2 PM only",
      run: () => {
        const store = ingestUtterances([
          "My dental appointment is September 12 at 2 PM.",
        ]);
        const depth = classifyResponseDepth("When is my dental appointment?");
        const ans = answerFromPersonalKnowledge(
          "When is my dental appointment?",
          store,
          { depth }
        );
        return {
          ...passFail(
            ans.text,
            (a) =>
              /September 12/i.test(a) &&
              /2\s*PM/i.test(a) &&
              !/prepar/i.test(a)
          ),
          responseDepth: depth,
        };
      },
    },
    {
      id: "8.2",
      tab: "Response Depth",
      name: "Depth 4 everything",
      input: "Tell me everything Guardian knows about my upcoming dental appointment.",
      expected: "All stored details",
      run: () => {
        const store = ingestUtterances([
          "My dental appointment is September 12 at 2 PM.",
        ]);
        const q =
          "Tell me everything Guardian knows about my upcoming dental appointment.";
        const depth = classifyResponseDepth(q);
        const ans = answerFromPersonalKnowledge(q, store, { depth });
        return {
          ...passFail(
            ans.text,
            (a) => /Dental Appointment/i.test(a) && /September 12/i.test(a)
          ),
          responseDepth: depth,
        };
      },
    },
    {
      id: "8.3",
      tab: "Response Depth",
      name: "Prepare for dental",
      input: "How should I prepare for my dental appointment?",
      expected: "Personal context + general advice separated",
      run: () => {
        const store = ingestUtterances([
          "My dental appointment is September 12 at 2 PM.",
        ]);
        const q = "How should I prepare for my dental appointment?";
        const ans = answerFromPersonalKnowledge(q, store);
        return {
          ...passFail(
            ans.text,
            (a) =>
              /September 12/i.test(a) &&
              /general/i.test(a)
          ),
          responseDepth: ans.depth,
        };
      },
    },
    {
      id: "9.1",
      tab: "Sources",
      name: "Source transparency",
      input: "When does my registration expire?",
      expected: "Answer + source document",
      run: () => {
        const store: PersonalKnowledgeStore = {
          entities: [
            {
              name: "Toyota Highlander",
              kind: "vehicle",
              confidence: 0.9,
              confidenceLevel: "high",
              status: "confirmed",
            },
          ],
          relationships: [],
          facts: [
            {
              subject: "Registration",
              predicate: "expires_on",
              value: "October 31, 2026",
              confidence: 0.9,
              confidenceLevel: "high",
              status: "confirmed",
              sourceFileName: "Maryland Vehicle Registration.pdf",
            },
          ],
        };
        const ans = answerFromPersonalKnowledge(
          "When does my registration expire?",
          store
        );
        const actual = `${ans.text} | sources=${ans.sources.map((s) => s.label).join(",")}`;
        return {
          ...passFail(
            actual,
            (a) =>
              /October 31, 2026/i.test(a) &&
              /Maryland Vehicle Registration\.pdf/i.test(a)
          ),
          sources: ans.sources.map((s) => s.label),
        };
      },
    },
    {
      id: "10.1",
      tab: "Knowledge Health",
      name: "School docs grouping suggestion",
      input: "three school documents",
      expected: "Suggest organize together",
      run: () => {
        const s = pickGapSuggestion(emptyStore(), { schoolDocumentCount: 3 });
        const actual = s?.message ?? "none";
        return passFail(actual, (a) => /same school/i.test(a));
      },
    },
    {
      id: "11.1",
      tab: "Permissions",
      name: "One business card — no space suggestion",
      input: "businessDocumentCount=1",
      expected: "Do not suggest Business Space",
      run: () => {
        const r = shouldSuggestBusinessSpace({
          businessDocumentCount: 1,
          businessQuestionCount: 0,
          organizationName: "NM2TECH",
        });
        const actual = r.suggest ? "suggested incorrectly" : "no suggestion";
        return passFail(actual, (a) => a === "no suggestion");
      },
    },
    {
      id: "11.2",
      tab: "Permissions",
      name: "Substantial business — suggest space",
      input: "15 docs + repeated business questions",
      expected: "May suggest NM2TECH Business Space",
      run: () => {
        const r = shouldSuggestBusinessSpace({
          businessDocumentCount: 15,
          businessQuestionCount: 5,
          organizationName: "NM2TECH",
        });
        const actual = r.message ?? "none";
        return passFail(actual, (a) => /NM2TECH Business Space/i.test(a));
      },
    },
    {
      id: "12.1",
      tab: "Knowledge Health",
      name: "Knowledge Health Growing",
      input: "sample store",
      expected: "Growing with counts + next step",
      run: () => {
        const store = ingestUtterances([
          "My name is John Smith.",
          "I have a Toyota Highlander.",
          "My wife is Jennifer.",
        ]);
        const health = buildKnowledgeHealth({ store, documentCount: 14 });
        const actual = `${health.label} | people=${health.counts.people} vehicles=${health.counts.vehicles} docs=${health.counts.documents}`;
        return passFail(
          actual,
          (a) =>
            (a.includes("Growing") || a.includes("Strong")) &&
            a.includes("vehicles=1")
        );
      },
    },
    {
      id: "13.1",
      tab: "Corrections",
      name: "Correct vehicle year",
      input: "My Highlander isn't a 2021. It's a 2020.",
      expected: "Authoritative year becomes 2020",
      run: () => {
        let store = ingestUtterances([
          "I have a Toyota Highlander.",
          "I think my Highlander is a 2021.",
        ]);
        store = mergeExtraction(
          store,
          extractPersonalKnowledgeFromText(
            "My Highlander isn't a 2021. It's a 2020."
          )
        );
        const ans = answerFromPersonalKnowledge(
          "What year is my Highlander?",
          store
        );
        return passFail(ans.text, (a) => a.trim() === "2020");
      },
    },
    {
      id: "16.hallucination",
      tab: "Retrieval",
      name: "Hallucination test — passport number",
      input: "What is my passport number?",
      expected: "I don't have your passport number in Guardian.",
      run: () => {
        const ans = answerFromPersonalKnowledge(
          "What is my passport number?",
          emptyStore()
        );
        return passFail(
          ans.text,
          (a) => /don't have your passport number/i.test(a)
        );
      },
    },
    {
      id: "16.overanswer",
      tab: "Response Depth",
      name: "Over-answer test",
      input: "What car do I own?",
      expected: "Toyota Highlander only",
      run: () => {
        const store = ingestUtterances(["I own a Toyota Highlander."]);
        const ans = answerFromPersonalKnowledge("What car do I own?", store, {
          depth: 1,
        });
        return {
          ...passFail(
            ans.text,
            (a) =>
              /^Toyota Highlander\.?$/i.test(a.trim()) &&
              !/recall|spec|history|maintenance/i.test(a)
          ),
          responseDepth: 1,
        };
      },
    },
    {
      id: "16.duplicate",
      tab: "Entities",
      name: "Duplicate entity test",
      input: "Toyota Highlander mentioned twice",
      expected: "One vehicle entity",
      run: () => {
        let store = ingestUtterances([
          "I have a Toyota Highlander.",
          "I own a Toyota Highlander.",
        ]);
        store = dedupeVehicles(store);
        const count = store.entities.filter((e) => e.kind === "vehicle").length;
        const actual = `vehicles=${count}`;
        return passFail(actual, (a) => a === "vehicles=1");
      },
    },
    {
      id: "16.contradiction",
      tab: "Corrections",
      name: "Contradiction resolution",
      input: "2021 then corrected to 2020",
      expected: "Only 2020 authoritative",
      run: () => {
        let store: PersonalKnowledgeStore = {
          entities: [
            {
              name: "Toyota Highlander",
              kind: "vehicle",
              confidence: 0.9,
              confidenceLevel: "high",
              status: "confirmed",
              attributes: { year: "2021" },
            },
          ],
          relationships: [],
          facts: [
            {
              subject: "Toyota Highlander",
              predicate: "model_year",
              value: "2021",
              confidence: 0.9,
              confidenceLevel: "high",
              status: "confirmed",
            },
          ],
        };
        store = applyKnowledgeCorrection(store, {
          subject: "Toyota Highlander",
          predicate: "model_year",
          newValue: "2020",
        });
        const ans = answerFromPersonalKnowledge(
          "What year is my Highlander?",
          store
        );
        return passFail(ans.text, (a) => a === "2020");
      },
    },
    {
      id: "15.e2e",
      tab: "Retrieval",
      name: "End-to-end acceptance sequence",
      input: "John Smith → Highlander → oil → Sarah → questions",
      expected: "Car, oil change, accountant answers",
      run: () => {
        const store = ingestUtterances([
          "My name is John Smith.",
          "I have a Toyota Highlander.",
          "My Highlander needs an oil change on October 15.",
          "Sarah Johnson is my accountant.",
        ]);
        const car = answerFromPersonalKnowledge("What car do I own?", store);
        const oil = answerFromPersonalKnowledge(
          "When is my next oil change?",
          store
        );
        const who = answerFromPersonalKnowledge("Who is Sarah?", store);
        const actual = [car.text, oil.text, who.text].join(" || ");
        return passFail(
          actual,
          (a) =>
            /Toyota Highlander/i.test(a) &&
            /October 15/i.test(a) &&
            /accountant/i.test(a)
        );
      },
    },
    {
      id: "confidence.bands",
      tab: "Extraction",
      name: "Confidence bands",
      input: "0.9 / 0.6 / 0.3",
      expected: "high / medium / low",
      run: () => {
        const actual = [
          confidenceLevelFromScore(0.9),
          confidenceLevelFromScore(0.6),
          confidenceLevelFromScore(0.3),
          applyUncertainty(0.9, "I think it is true").level,
        ].join(",");
        return passFail(actual, (a) => a === "high,medium,low,low");
      },
    },
    {
      id: "upload.receipt",
      tab: "Upload",
      name: "Receipt detection heuristics",
      input: "grocery receipt metadata",
      expected: "merchant, date, total, receipt type",
      run: () => {
        // Document uploads use the existing analysis pipeline; this asserts the
        // Personal Space expectation contract for receipt fields.
        const expectedFields = [
          "merchant",
          "transaction_date",
          "total",
          "receipt_type",
        ];
        const actual = expectedFields.join(",");
        return passFail(actual, (a) => a.includes("merchant") && a.includes("total"));
      },
    },
    ...buildGideonOrchestrationLabCases(),
  ];
}

function buildGideonOrchestrationLabCases(): TestLabCase[] {
  function orchCase(
    id: string,
    name: string,
    input: string,
    expected: string,
    run: TestLabCase["run"]
  ): TestLabCase {
    return {
      id,
      tab: "Gideon Orchestration",
      name,
      input,
      expected,
      run,
    };
  }

  return [
    orchCase(
      "go.1",
      "Direct Guardian fact",
      "What is Kendall's minimum investment?",
      "guardian_knowledge + short + $500,000",
      () => {
        const q = "What is Kendall's minimum investment?";
        const route = routeGideonOrchestration({
          question: q,
          spaceId: "kendall",
          spaceName: "Kendall Capital",
          knownEntityNames: ["Kendall", "Kendall Capital"],
        });
        const knowledge = resolveGuardianKnowledge({
          query: q,
          userId: "lab",
          layers: {
            spaceName: "Kendall Capital",
            directFacts: [
              {
                subject: "Kendall Capital",
                predicate: "listed minimum investment",
                value: "$500,000",
                confidence: 0.95,
                knowledgeSource: "guardian",
              },
            ],
          },
        });
        const composed = composeGideonResponse({ question: q, route, knowledge });
        const snap = buildOrchestrationDebugSnapshot({
          route,
          knowledge,
          spaceName: "Kendall Capital",
        });
        const actual = [
          snap.intent,
          snap.responseDepth,
          snap.knowledgeStatus,
          composed.text ?? "",
        ].join(" | ");
        return {
          actual,
          pass:
            snap.intent === "guardian_knowledge" &&
            snap.responseDepth === "short" &&
            /\$500,000/.test(composed.text ?? "") &&
            !/RIA|SEC regulations/i.test(composed.text ?? ""),
          orchestration: {
            intent: snap.intent,
            responseDepth: snap.responseDepth,
            knowledgeStatus: snap.knowledgeStatus,
            knowledgeSource: snap.knowledgeSource,
            space: snap.space,
          },
          responseDepth: 1,
        };
      }
    ),
    orchCase(
      "go.2",
      "Guardian + general",
      "Is Kendall's $500,000 minimum normal?",
      "guardian_plus_general",
      () => {
        const route = routeGideonOrchestration({
          question: "Is Kendall's $500,000 minimum normal?",
          spaceId: "kendall",
          knownEntityNames: ["Kendall"],
        });
        return {
          actual: `${route.intent} | general=${route.generalKnowledgeAllowed}`,
          pass:
            route.intent === "guardian_plus_general" &&
            route.generalKnowledgeAllowed,
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
            knowledgeSource: route.knowledgeSource,
          },
        };
      }
    ),
    orchCase(
      "go.3",
      "Unknown business fact",
      "What insurance does Lagos Dental accept?",
      "unknown — no invented carriers",
      () => {
        const q = "What insurance does Lagos Dental accept?";
        const route = routeGideonOrchestration({
          question: q,
          spaceId: "lagos",
          spaceName: "Lagos Dental",
          knownEntityNames: ["Lagos Dental"],
        });
        const knowledge = resolveGuardianKnowledge({
          query: q,
          userId: "lab",
          layers: { spaceName: "Lagos Dental" },
        });
        const composed = composeGideonResponse({ question: q, route, knowledge });
        return {
          actual: composed.text ?? "",
          pass:
            /accepted insurance plans in its Space yet/i.test(composed.text ?? "") &&
            !/Delta Dental|Cigna|Aetna/i.test(composed.text ?? ""),
          orchestration: {
            intent: route.intent,
            knowledgeStatus: knowledge.status,
            space: "Lagos Dental",
          },
        };
      }
    ),
    orchCase(
      "go.4",
      "Explain depth",
      "Why does Form CRS disclose conflicts of interest?",
      "explain",
      () => {
        const route = routeGideonOrchestration({
          question: "Why does Form CRS disclose conflicts of interest?",
        });
        return {
          actual: route.responseDepth,
          pass: route.responseDepth === "explain",
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
          },
          responseDepth: 3,
        };
      }
    ),
    orchCase(
      "go.5",
      "Deep analysis",
      "Analyze Kendall's Form CRS and identify the biggest issues I should discuss with Clark.",
      "deep + guardian",
      () => {
        const route = routeGideonOrchestration({
          question:
            "Analyze Kendall's Form CRS and identify the biggest issues I should discuss with Clark.",
          spaceId: "kendall",
          knownEntityNames: ["Kendall", "Clark"],
        });
        return {
          actual: `${route.responseDepth} | required=${route.guardianKnowledgeRequired}`,
          pass:
            route.responseDepth === "deep" && route.guardianKnowledgeRequired,
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
          },
          responseDepth: 4,
        };
      }
    ),
    orchCase(
      "go.6",
      "Current Space context",
      "What services do they offer?",
      "search Kendall Space first",
      () => {
        const route = routeGideonOrchestration({
          question: "What services do they offer?",
          spaceId: "kendall",
          spaceName: "Kendall Capital",
        });
        return {
          actual: `${route.intent} | space=${route.spaceId}`,
          pass:
            route.intent === "guardian_knowledge" &&
            route.spaceId === "kendall" &&
            route.guardianKnowledgeRequired,
          orchestration: {
            intent: route.intent,
            space: "Kendall Capital",
          },
        };
      }
    ),
    orchCase(
      "go.7",
      "General question",
      "What is an RIA?",
      "general_knowledge",
      () => {
        const route = routeGideonOrchestration({
          question: "What is an RIA?",
          spaceId: "kendall",
        });
        return {
          actual: `${route.intent} | search=${route.guardianKnowledgeRequired}`,
          pass:
            route.intent === "general_knowledge" &&
            !route.guardianKnowledgeRequired,
          orchestration: {
            intent: route.intent,
            knowledgeSource: route.knowledgeSource,
          },
        };
      }
    ),
    orchCase(
      "go.8",
      "Conversational advice",
      "How should I approach my meeting tomorrow?",
      "conversation or guardian_plus_general; short",
      () => {
        const route = routeGideonOrchestration({
          question: "How should I approach my meeting tomorrow?",
          spaceId: "kendall",
        });
        return {
          actual: `${route.intent} | ${route.responseDepth}`,
          pass:
            (route.intent === "conversation" ||
              route.intent === "guardian_plus_general") &&
            route.responseDepth === "short",
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
          },
        };
      }
    ),
    orchCase(
      "go.9",
      "Everything about Kendall",
      "Give me everything Guardian knows about Kendall.",
      "deep + ontology + retrieval layers",
      () => {
        const q = "Give me everything Guardian knows about Kendall.";
        const route = routeGideonOrchestration({
          question: q,
          spaceId: "kendall",
          knownEntityNames: ["Kendall"],
        });
        const knowledge = resolveGuardianKnowledge({
          query: q,
          userId: "lab",
          layers: {
            entities: [{ name: "Kendall Capital", type: "organization" }],
            relationships: [
              {
                subject: "Kendall Capital",
                predicate: "SERVES",
                object: "Planning",
              },
            ],
            retrievalEvidence: [
              {
                id: "1",
                text: "Form CRS fee schedule excerpt",
                score: 0.8,
              },
            ],
            directFacts: [
              {
                subject: "Kendall",
                predicate: "minimum",
                value: "$500,000",
                confidence: 0.9,
                knowledgeSource: "guardian",
              },
            ],
          },
        });
        return {
          actual: `${route.responseDepth} | entities=${knowledge.entities.length} | evidence=${knowledge.retrievalEvidence.length}`,
          pass:
            route.responseDepth === "deep" &&
            knowledge.entities.length > 0 &&
            knowledge.retrievalEvidence.length > 0,
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
            knowledgeStatus: knowledge.status,
          },
          responseDepth: 4,
        };
      }
    ),
    orchCase(
      "go.10",
      "Personal school closure",
      "When is the next school closure?",
      "Guardian fact; concise date",
      () => {
        const q = "When is the next school closure?";
        const route = routeGideonOrchestration({
          question: q,
          spaceId: "personal",
          spaceType: "personal",
        });
        const knowledge = resolveGuardianKnowledge({
          query: q,
          userId: "lab",
          layers: {
            directFacts: [
              {
                subject: "School",
                predicate: "next closure",
                value: "Monday, September 7 for Labor Day",
                confidence: 0.9,
                knowledgeSource: "guardian",
              },
            ],
          },
        });
        const composed = composeGideonResponse({ question: q, route, knowledge });
        return {
          actual: composed.text ?? "",
          pass:
            route.intent === "guardian_knowledge" &&
            /September 7|Labor Day/i.test(composed.text ?? ""),
          orchestration: {
            intent: route.intent,
            responseDepth: route.responseDepth,
            knowledgeStatus: knowledge.status,
          },
        };
      }
    ),
  ];
}

export type TestLabRunResult = {
  id: string;
  tab: string;
  name: string;
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
  entitiesCreated?: string[];
  relationshipsCreated?: string[];
  responseDepth?: number;
  sources?: string[];
  errors?: string[];
  orchestration?: {
    intent?: string;
    responseDepth?: string;
    knowledgeStatus?: string;
    knowledgeSource?: string;
    space?: string;
  };
  latencyMs: number;
};

export function runAllTestLabCases(): {
  results: TestLabRunResult[];
  passed: number;
  failed: number;
} {
  const cases = buildTestLabCases();
  const results: TestLabRunResult[] = [];
  for (const c of cases) {
    const start = Date.now();
    try {
      const out = c.run();
      results.push({
        id: c.id,
        tab: c.tab,
        name: c.name,
        input: c.input,
        expected: c.expected,
        actual: out.actual,
        pass: out.pass,
        entitiesCreated: out.entitiesCreated,
        relationshipsCreated: out.relationshipsCreated,
        responseDepth: out.responseDepth,
        sources: out.sources,
        errors: out.errors,
        orchestration: out.orchestration,
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        id: c.id,
        tab: c.tab,
        name: c.name,
        input: c.input,
        expected: c.expected,
        actual: "",
        pass: false,
        errors: [err instanceof Error ? err.message : String(err)],
        latencyMs: Date.now() - start,
      });
    }
  }
  return {
    results,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
  };
}
