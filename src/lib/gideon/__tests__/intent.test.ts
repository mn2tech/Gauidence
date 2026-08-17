import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGideonIntent,
  shouldSearchGuardianKnowledge,
} from "../intent.ts";
import { loadFlagsForRoute } from "../capabilities.ts";

describe("Gideon intent router — acceptance", () => {
  it("Test 1: Pomodoro definition is conversation, no Guardian search", () => {
    const route = classifyGideonIntent({
      question: "What is the Pomodoro technique?",
    });
    assert.equal(route.intent, "conversation");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
    assert.deepEqual(route.statusSteps, ["Thinking..."]);
  });

  it("Test 2: 90/20 vs Pomodoro is Chief of Staff, no Guardian search", () => {
    const route = classifyGideonIntent({
      question:
        "Help me decide whether 90/20 or Pomodoro is better for my workday.",
    });
    assert.equal(route.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
    assert.ok(route.statusSteps.includes("Planning your day..."));
    assert.ok(!route.statusSteps.includes("Searching Guardian..."));
  });

  it("Test 3: uploaded handbook is Guardian knowledge search", () => {
    const route = classifyGideonIntent({
      question: "What does the uploaded employee handbook say about PTO?",
    });
    assert.equal(route.intent, "knowledge_search");
    assert.equal(shouldSearchGuardianKnowledge(route), true);
    assert.ok(route.statusSteps.includes("Searching Guardian..."));
  });

  it("Test 4: plan today is Chief of Staff", () => {
    const route = classifyGideonIntent({ question: "Help me plan today." });
    assert.equal(route.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
  });

  it("remaining time / start block is Chief of Staff, no Guardian search", () => {
    const remaining = classifyGideonIntent({
      question: "How much time is left?",
    });
    assert.equal(remaining.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(remaining), false);
    const start = classifyGideonIntent({
      question: "Start a 90-minute focus block now.",
    });
    assert.equal(start.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(start), false);
  });

  it("Test 5: meetings today is calendar, no document retrieval", () => {
    const route = classifyGideonIntent({
      question: "What meetings do I have today?",
    });
    assert.equal(route.intent, "calendar");
    assert.equal(route.capabilities.calendar, true);
    assert.equal(shouldSearchGuardianKnowledge(route), false);
    assert.ok(route.statusSteps.includes("Checking your calendar..."));
    assert.ok(!route.statusSteps.includes("Searching Guardian..."));
  });

  it("Test 6: plan around meetings is combined", () => {
    const route = classifyGideonIntent({
      question: "Plan my day around my meetings.",
    });
    assert.equal(route.intent, "combined");
    assert.equal(route.capabilities.calendar, true);
    assert.equal(route.capabilities.chiefOfStaff, true);
    assert.ok(route.statusSteps.includes("Checking your calendar..."));
    assert.ok(route.statusSteps.includes("Planning your day..."));
  });

  it("Test 7: block time requires confirmation before calendar write", () => {
    const route = classifyGideonIntent({
      question: "Block 9:00–10:30 tomorrow for Guardian development.",
    });
    assert.equal(route.intent, "calendar");
    assert.equal(route.calendarWrite, true);
    assert.equal(route.confirmationRequired, true);
    assert.equal(shouldSearchGuardianKnowledge(route), false);
  });

  it("Test 8: earlier decision uses conversation context, not Guardian", () => {
    const route = classifyGideonIntent({
      question: "What did we decide earlier about my 90/20 schedule?",
      history: [
        { role: "user", content: "I want a 90/20 schedule." },
        {
          role: "assistant",
          content:
            "9:00–10:30 Guardian launch. 10:30–10:50 break. 10:50–12:20 NM2TECH.",
        },
      ],
    });
    assert.equal(route.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
  });
});

describe("Gideon intent router — follow-ups and tools", () => {
  it("moves the second block using chat context", () => {
    const route = classifyGideonIntent({
      question: "Move the second block until after lunch.",
      history: [
        { role: "user", content: "I want to start using a 90/20 work schedule." },
        {
          role: "assistant",
          content:
            "**9:00–10:30** Guardian\n**10:30–10:50** Break\n**10:50–12:20** NM2TECH",
        },
      ],
    });
    assert.equal(route.intent, "chief_of_staff");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
  });

  it("treats a 90/20 definition as conversation", () => {
    const route = classifyGideonIntent({
      question: "What is a 90/20 work schedule?",
    });
    assert.equal(route.intent, "conversation");
    assert.equal(shouldSearchGuardianKnowledge(route), false);
  });

  it("treats creating a 90/20 schedule as Chief of Staff", () => {
    const route = classifyGideonIntent({
      question: "Help me create a 90/20 schedule so I can focus better.",
    });
    assert.equal(route.intent, "chief_of_staff");
  });

  it("searches Guardian for a named contract", () => {
    const route = classifyGideonIntent({
      question: "What does the TTB contract say about termination?",
    });
    assert.equal(route.intent, "knowledge_search");
    assert.equal(shouldSearchGuardianKnowledge(route), true);
  });

  it("searches Guardian for find-my-document questions", () => {
    const route = classifyGideonIntent({ question: "find my passport" });
    assert.equal(route.intent, "knowledge_search");
    assert.equal(shouldSearchGuardianKnowledge(route), true);
  });

  it("searches Guardian for Trello chord and analyzed-PDF questions", () => {
    const chords = classifyGideonIntent({
      question: "What are the chords for Ibadat Karo?",
    });
    assert.equal(chords.intent, "knowledge_search");
    assert.equal(shouldSearchGuardianKnowledge(chords), true);

    const key = classifyGideonIntent({
      question: "What key is Ae reethi?",
    });
    assert.equal(shouldSearchGuardianKnowledge(key), true);

    const pdf = classifyGideonIntent({
      question: "Can you see the analyzed PDF?",
    });
    assert.equal(shouldSearchGuardianKnowledge(pdf), true);

    const openPdf = classifyGideonIntent({
      question: "open this pdf",
    });
    assert.equal(shouldSearchGuardianKnowledge(openPdf), true);

    const songs = classifyGideonIntent({
      question: "What songs are on The Living Waters?",
    });
    assert.equal(songs.intent, "knowledge_search");
    assert.equal(shouldSearchGuardianKnowledge(songs), true);

    const list = classifyGideonIntent({
      question: "give me the list of songs",
    });
    assert.equal(shouldSearchGuardianKnowledge(list), true);

    const chartTitle = classifyGideonIntent({
      question: "What a Beautiful Name - C",
    });
    assert.equal(shouldSearchGuardianKnowledge(chartTitle), true);
  });

  it("forces knowledge when an attachment is present", () => {
    const route = classifyGideonIntent({
      question: "What is this?",
      hasAttachment: true,
    });
    assert.equal(shouldSearchGuardianKnowledge(route), true);
  });

  it("does not expose internal routing terms in status steps", () => {
    const route = classifyGideonIntent({
      question: "Search Guardian for what I should know from my spaces right now.",
    });
    assert.ok(!route.statusSteps.some((s) => /RAG|vector|intent|router/i.test(s)));
  });
});

describe("loadFlagsForRoute", () => {
  it("skips document RAG for conversation and Chief of Staff", () => {
    const conversation = loadFlagsForRoute(
      classifyGideonIntent({ question: "What is the Pomodoro technique?" })
    );
    const cos = loadFlagsForRoute(
      classifyGideonIntent({ question: "Help me plan today." })
    );
    assert.equal(conversation.documents, false);
    assert.equal(cos.documents, false);
    assert.equal(cos.workMemory, true);
  });

  it("loads documents only for knowledge search", () => {
    const flags = loadFlagsForRoute(
      classifyGideonIntent({
        question: "What does the uploaded employee handbook say about PTO?",
      })
    );
    assert.equal(flags.documents, true);
    assert.equal(flags.logs, true);
    assert.equal(flags.vaultMap, true);
  });
});
