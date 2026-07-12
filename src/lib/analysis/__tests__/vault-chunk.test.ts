import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVaultIndexText,
  chunkText,
  prepareVaultChunks,
} from "../../vault/chunk.ts";
import { formatRetrievalContext } from "../../vault/retrieve.ts";

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
});
