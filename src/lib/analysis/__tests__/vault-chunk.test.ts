import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVaultIndexText,
  chunkText,
  prepareVaultChunks,
} from "../../vault/chunk.ts";
import {
  formatRetrievalContext,
  selectCitationsForAnswer,
} from "../../vault/retrieve.ts";

describe("vault RAG chunking", () => {
  it("builds searchable text from analysis fields", () => {
    const text = buildVaultIndexText({
      fileName: "invoice.pdf",
      title: "NM2TECH Invoice",
      summary: "Consulting invoice.",
      documentType: "invoice",
      facts: [{ label: "Invoice number", value: "#0000016", source: "document" }],
      specialist: { total_amount_due: 71628, __raw_model: { x: 1 } },
    });
    assert.match(text, /invoice\.pdf/);
    assert.match(text, /#0000016/);
    assert.match(text, /71628/);
    assert.doesNotMatch(text, /__raw_model/);
  });

  it("splits long text into overlapping chunks", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Line ${i} content here.`).join(
      "\n"
    );
    const chunks = chunkText(long, 80, 20);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length > 0));
  });

  it("prepareVaultChunks returns empty for blank analysis", () => {
    assert.deepEqual(
      prepareVaultChunks({ fileName: "x.pdf", summary: "   ", facts: [] }),
      []
    );
  });

  it("indexes full source text in addition to analysis", () => {
    const chunks = prepareVaultChunks({
      fileName: "flyer.pdf",
      summary: "Summer camp registration.",
      facts: [{ label: "Camp", value: "Lakeview", source: "document" }],
      sourceText:
        "Summer camp starts June 12. Bring sunscreen and a water bottle.",
    });
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some((c) => /Summer camp registration/i.test(c)));
    assert.ok(chunks.some((c) => /Document text/i.test(c) && /sunscreen/i.test(c)));
  });

  it("indexes source-only documents without analysis body", () => {
    const chunks = prepareVaultChunks({
      fileName: "notes.txt",
      sourceText: "Meeting notes from Tuesday. Action item: send follow-up email.",
    });
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]!, /Document text:/);
    assert.match(chunks[0]!, /follow-up email/);
  });
});

describe("vault retrieval formatting", () => {
  it("dedupes citations by document", () => {
    const { context, citations } = formatRetrievalContext([
      {
        id: "1",
        document_id: "d1",
        file_name: "a.pdf",
        content: "hello",
        chunk_index: 0,
        similarity: 0.9,
      },
      {
        id: "2",
        document_id: "d1",
        file_name: "a.pdf",
        content: "world",
        chunk_index: 1,
        similarity: 0.8,
      },
      {
        id: "3",
        document_id: "d2",
        file_name: "b.pdf",
        content: "other",
        chunk_index: 0,
        similarity: 0.7,
      },
    ]);
    assert.match(context, /a\.pdf/);
    assert.match(context, /b\.pdf/);
    assert.equal(citations.length, 2);
  });

  it("labels linked vault owners in retrieval context", () => {
    const { context } = formatRetrievalContext([
      {
        id: "1",
        document_id: "d1",
        file_name: "iep.pdf",
        content: "school plan",
        chunk_index: 0,
        similarity: 0.9,
        profile_name: "Maya",
      },
    ]);
    assert.match(context, /Maya · iep\.pdf/);
    assert.match(context, /vault:Maya/);
  });

  it("only cites documents named in the answer", () => {
    const chunks = [
      {
        id: "1",
        document_id: "d-onyx",
        file_name: "Onyx_Invoice16_2026_June.pdf",
        content: "total 71628",
        chunk_index: 0,
        similarity: 0.92,
      },
      {
        id: "2",
        document_id: "d-reggie",
        file_name: "Reggie_Invoice.pdf",
        content: "other invoice",
        chunk_index: 0,
        similarity: 0.71,
      },
      {
        id: "3",
        document_id: "d-mortgage",
        file_name: "Rocket Mortgage - Closing Package.pdf",
        content: "closing",
        chunk_index: 0,
        similarity: 0.55,
      },
    ];

    const cited = selectCitationsForAnswer(
      "You are expecting $71,628 from Invoice #0000016.\nSource: Onyx_Invoice16_2026_June.pdf",
      chunks
    );
    assert.equal(cited.length, 1);
    assert.equal(cited[0]?.fileName, "Onyx_Invoice16_2026_June.pdf");

    const noneNamed = selectCitationsForAnswer(
      "You are expecting $71,628 based on your invoice.",
      chunks
    );
    assert.equal(noneNamed.length, 0);
  });
});
