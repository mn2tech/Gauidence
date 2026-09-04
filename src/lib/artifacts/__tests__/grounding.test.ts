/**
 * Regression tests: current-input grounding vs cross-document contamination.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerClaimsAttachmentView,
  applyRetrievalGuard,
  buildGroundingDebugSnapshot,
  classifySourceType,
  createArtifactIdentity,
  evidenceClaimSystemNote,
  extractEmailThread,
  formatEmailThreadSemantics,
  formatWhyGideonUsedContext,
  looksLikeEmailThread,
  mayClaimAttachmentView,
  scoreArtifactRelevance,
} from "../index";
import type { GuardableChunk } from "../retrievalGuard";

const OLNEY_EMAIL = `From: Jaime Costolo <jaime@olneychamber.org>
To: Michael Kola <michael@nm2tech.com>
Cc: Terri Hogan <terri@olneychamber.org>
Subject: Re: Chamber email security follow-up
Date: Tuesday, March 4, 2026 2:14 PM

Hi Michael,

Thanks for helping with the compromised Chamber Gmail account.

Quick question before Thursday's security session at 11:30 PM — does Sarah (our other Chamber employee) also need to attend the office meeting, or can the same security remediation / configuration work be completed on Sarah's computer later?

Please let me know so I can update Terri.

Thanks,
Jaime Costolo
Olney Chamber of Commerce

--
Sent from my iPhone

From: Michael Kola <michael@nm2tech.com>
To: Jaime Costolo <jaime@olneychamber.org>
Subject: Chamber email security follow-up
Date: Monday, March 3, 2026 4:02 PM

Jaime — confirming we will walk through remediation at the Chamber office on Thursday at 11:30 PM. Please have Terri available.

Michael Kola
NM2TECH
`;

const WEDDING_CHUNK: GuardableChunk = {
  id: "c-wedding",
  document_id: "doc-wedding",
  file_name: "wedding-invitation.jpg",
  content:
    "You are invited to the wedding of Jordan and Alex. Ceremony Saturday at Grace Chapel. RSVP by May 1.",
  chunk_index: 0,
  similarity: 0.91,
  fusion_score: 0.91,
  profile_id: "space-nm2",
  profile_name: "NM2TECH",
};

const MINISTRY_CHUNK: GuardableChunk = {
  id: "c-ministry",
  document_id: "doc-ministry",
  file_name: "revival-flyer.png",
  content:
    "Join us for a ministry revival night. Worship and prayer at First Church. Bring a friend.",
  chunk_index: 0,
  similarity: 0.88,
  fusion_score: 0.88,
  profile_id: "space-nm2",
};

const LICENSE_CHUNK: GuardableChunk = {
  id: "c-license",
  document_id: "doc-license",
  file_name: "maryland-drivers-license.jpg",
  content:
    "Maryland Driver's License. DLN: M123456789012. DOB: 01/01/1980. Class C. Address 123 Main St.",
  chunk_index: 0,
  similarity: 0.95,
  fusion_score: 0.95,
  document_type: "drivers_license",
  profile_id: "space-nm2",
};

const PRIOR_CHAMBER_CHUNK: GuardableChunk = {
  id: "c-prior-chamber",
  document_id: "doc-prior-chamber",
  file_name: "olney-chamber-compromised-gmail.txt",
  content:
    "Olney Chamber of Commerce compromised Gmail incident. Jaime Costolo reported unauthorized access. NM2TECH began remediation. Terri Hogan was notified.",
  chunk_index: 0,
  similarity: 0.72,
  fusion_score: 0.72,
  profile_id: "space-nm2",
};

const EMAIL_A_CHUNK: GuardableChunk = {
  id: "c-email-a",
  document_id: "doc-email-a",
  file_name: "Email thread - Olney Chamber security.txt",
  content: OLNEY_EMAIL,
  chunk_index: 0,
  similarity: 1,
  fusion_score: 1,
  profile_id: "space-nm2",
  source_type: "email_thread",
};

describe("artifact classify — email threads", () => {
  it("classifies the Olney Chamber paste as email_thread", () => {
    assert.equal(looksLikeEmailThread(OLNEY_EMAIL), true);
    assert.equal(classifySourceType({ content: OLNEY_EMAIL }), "email_thread");
  });

  it("extracts participants, Thursday meeting, Sarah question, and PM ambiguity", () => {
    const extracted = extractEmailThread(OLNEY_EMAIL);
    assert.ok(extracted);
    const names = extracted!.participants.map((p) => p.name.toLowerCase());
    assert.ok(names.some((n) => n.includes("jaime")));
    assert.ok(names.some((n) => n.includes("terri")));
    assert.ok(names.some((n) => n.includes("michael")));
    assert.ok(names.some((n) => n.includes("sarah")));
    assert.ok(
      extracted!.organizations.some((o) => /olney chamber/i.test(o))
    );
    assert.ok(extracted!.organizations.some((o) => /nm2tech/i.test(o)));
    assert.ok(
      extracted!.questions.some((q) => /sarah/i.test(q) && /attend/i.test(q))
    );
    assert.ok(extracted!.appointments.some((a) => /thursday/i.test(a)));
    assert.ok(extracted!.timeAmbiguities.length >= 1);
    assert.ok(/11:30\s*PM/i.test(extracted!.timeAmbiguities[0]!));

    const semantics = formatEmailThreadSemantics(extracted!);
    assert.match(semantics, /Sarah/i);
    assert.match(semantics, /email_thread/);
  });

  it("does not treat repeated signatures as separate events", () => {
    const withDupSig = `${OLNEY_EMAIL}\n\nSent from my iPhone\n\nSent from my iPhone\n`;
    const extracted = extractEmailThread(withDupSig);
    assert.ok(extracted);
    assert.ok(extracted!.messages.length <= 3);
    assert.ok(
      !extracted!.appointments.some((a) => /sent from my iphone/i.test(a))
    );
  });
});

describe("retrieval guard — contamination regression", () => {
  const current = createArtifactIdentity({
    artifactId: "doc-email-a",
    spaceId: "space-nm2",
    content: OLNEY_EMAIL,
    sourceName: "Email thread - Olney Chamber security.txt",
    sourceType: "email_thread",
  });

  it("TEST 1: paste email A — unrelated images excluded", () => {
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "What is Jaime asking about?",
      analyzingCurrentArtifact: true,
      chunks: [EMAIL_A_CHUNK, WEDDING_CHUNK, MINISTRY_CHUNK],
    });
    const includedIds = new Set(
      result.includedChunks.map((c) => c.document_id)
    );
    assert.ok(includedIds.has("doc-email-a"));
    assert.equal(includedIds.has("doc-wedding"), false);
    assert.equal(includedIds.has("doc-ministry"), false);
  });

  it("TEST 2: driver's license receives zero exposure", () => {
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "Summarize this Chamber security email",
      analyzingCurrentArtifact: true,
      chunks: [EMAIL_A_CHUNK, LICENSE_CHUNK],
    });
    assert.equal(
      result.includedChunks.some((c) => c.document_id === "doc-license"),
      false
    );
    const licenseGroup = result.groups.find(
      (g) => g.artifact.artifactId === "doc-license"
    );
    assert.ok(licenseGroup);
    assert.equal(licenseGroup!.included, false);
    assert.equal(licenseGroup!.artifact.sensitivity, "high");
    assert.match(
      licenseGroup!.exclusionReason ?? "",
      /sensitive_unrelated_rejected/
    );
  });

  it("TEST 3: related prior Chamber email may be included and distinguished", () => {
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "How does this relate to the earlier Chamber Gmail issue?",
      analyzingCurrentArtifact: true,
      chunks: [EMAIL_A_CHUNK, PRIOR_CHAMBER_CHUNK, WEDDING_CHUNK],
    });
    const includedIds = new Set(
      result.includedChunks.map((c) => c.document_id)
    );
    assert.ok(includedIds.has("doc-email-a"));
    assert.ok(includedIds.has("doc-prior-chamber"));
    assert.equal(includedIds.has("doc-wedding"), false);
    const prior = result.groups.find(
      (g) => g.artifact.artifactId === "doc-prior-chamber"
    );
    assert.ok(prior?.included);
    assert.match(prior!.reasonRetrieved, /historical_relevant|current/);
  });

  it("TEST 5: current input wins over conflicting historical knowledge", () => {
    const conflicting: GuardableChunk = {
      id: "c-conflict",
      document_id: "doc-conflict",
      file_name: "old-notes.txt",
      content:
        "Meeting with Jaime is cancelled. Sarah does not work at the Chamber. Ignore Thursday plans.",
      chunk_index: 0,
      similarity: 0.99,
      fusion_score: 0.99,
      profile_id: "space-nm2",
    };
    // High vector score but low token overlap with current email body → reject
    const relevance = scoreArtifactRelevance({
      current: { content: OLNEY_EMAIL, sourceType: "email_thread" },
      candidate: {
        content: conflicting.content,
        sourceName: conflicting.file_name,
        fusionScore: 0.99,
      },
      userQuery: "What did Jaime ask in this email?",
    });
    // Even if somehow included, current artifact is always first / primary
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "What did Jaime ask in this email?",
      analyzingCurrentArtifact: true,
      chunks: [EMAIL_A_CHUNK, conflicting],
      historicalThreshold: Math.max(0.28, relevance + 0.01),
    });
    assert.ok(
      result.includedChunks[0]?.document_id === "doc-email-a" ||
        result.includedChunks.some((c) => c.document_id === "doc-email-a")
    );
    assert.equal(
      result.groups.find((g) => g.artifact.artifactId === "doc-email-a")
        ?.reasonRetrieved,
      "current_artifact"
    );
  });

  it("TEST 7: sensitive unrelated artifact with high vector similarity is rejected", () => {
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "Reply ideas for Jaime",
      analyzingCurrentArtifact: true,
      chunks: [
        EMAIL_A_CHUNK,
        { ...LICENSE_CHUNK, similarity: 0.99, fusion_score: 0.99 },
      ],
    });
    assert.equal(
      result.includedChunks.some((c) => c.document_id === "doc-license"),
      false
    );
    assert.ok(
      result.evidenceRulesApplied.includes("sensitive_document_isolation")
    );
  });
});

describe("evidence claims — no source no claim", () => {
  it("TEST 6: never claim attachments when none exist", () => {
    assert.equal(
      mayClaimAttachmentView({
        hasAttachedDocument: false,
        hasVisionImages: false,
        currentArtifactInContext: false,
        validatedAttachmentNames: [],
      }),
      false
    );
    const note = evidenceClaimSystemNote({
      mayClaimAttachments: false,
      validatedSourceNames: [],
    });
    assert.match(note, /NO SOURCE/);
    assert.match(note, /Do NOT say you can see attached images/i);
    assert.equal(
      answerClaimsAttachmentView(
        "I can see the three attached images clearly — a wedding invitation, a ministry event, and a Maryland driver's license."
      ),
      true
    );
  });
});

describe("grounding debug snapshot", () => {
  it("explains why context was included or excluded", () => {
    const current = createArtifactIdentity({
      artifactId: "doc-email-a",
      spaceId: "space-nm2",
      content: OLNEY_EMAIL,
      sourceName: "Email thread - Olney Chamber security.txt",
      sourceType: "email_thread",
    });
    const result = applyRetrievalGuard({
      currentArtifact: current,
      currentContent: OLNEY_EMAIL,
      userQuery: "What should Michael reply?",
      analyzingCurrentArtifact: true,
      chunks: [EMAIL_A_CHUNK, WEDDING_CHUNK, LICENSE_CHUNK],
    });
    const snap = buildGroundingDebugSnapshot({
      currentArtifact: current,
      groups: result.groups,
      evidenceRulesApplied: result.evidenceRulesApplied,
      emailThread: extractEmailThread(OLNEY_EMAIL),
    });
    assert.equal(snap.currentArtifactId, "doc-email-a");
    assert.equal(snap.detectedSourceType, "email_thread");
    assert.ok(snap.finalContextArtifactIds.includes("doc-email-a"));
    assert.ok(!snap.finalContextArtifactIds.includes("doc-wedding"));
    assert.ok(!snap.finalContextArtifactIds.includes("doc-license"));
    const why = formatWhyGideonUsedContext(snap);
    assert.match(why, /Why did Gideon use this context/);
    assert.match(why, /doc-email-a/);
    assert.match(why, /included: no/);
  });
});
