import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isJsonMimeOrName, normalizeJsonText } from "../jsonText";

describe("json text helpers", () => {
  it("detects JSON by mime or filename", () => {
    assert.equal(isJsonMimeOrName("application/json", "a.txt"), true);
    assert.equal(isJsonMimeOrName("text/json", "blob"), true);
    assert.equal(isJsonMimeOrName("", "export.JSON"), true);
    assert.equal(isJsonMimeOrName("text/plain", "notes.txt"), false);
  });

  it("pretty-prints valid JSON and keeps invalid text", () => {
    assert.equal(
      normalizeJsonText('{"name":"Ada","roles":["founder"]}'),
      '{\n  "name": "Ada",\n  "roles": [\n    "founder"\n  ]\n}'
    );
    assert.equal(normalizeJsonText("{not json"), "{not json");
    assert.equal(normalizeJsonText("  "), "");
  });

  it("compacts Trello exports into board and card text", () => {
    const text = normalizeJsonText(
      JSON.stringify({
        name: "Ops",
        url: "https://trello.com/b/ops",
        lists: [{ id: "l1", name: "Doing" }],
        cards: [
          {
            id: "c1",
            idList: "l1",
            name: "File taxes",
            desc: "Q3 return",
            due: "2026-09-01T00:00:00.000Z",
            closed: false,
            labels: [{ name: "Finance" }],
            attachments: [
              {
                name: "chords.pdf",
                mimeType: "application/pdf",
                url: "https://trello.com/1/cards/c1/attachments/a1/download/chords.pdf",
              },
            ],
          },
        ],
        actions: [{ id: "a1", type: "updateCard", data: { huge: "noise" } }],
      })
    );
    assert.match(text, /Trello board: Ops/);
    assert.match(text, /\[Doing\] File taxes/);
    assert.match(text, /Finance/);
    assert.match(text, /attachment \(PDF\): chords\.pdf/);
    assert.match(
      text,
      /https:\/\/trello\.com\/1\/cards\/c1\/attachments\/a1\/download\/chords\.pdf/
    );
    assert.doesNotMatch(text, /updateCard/);
  });

  it("recovers Trello attachments from actions when cards omit them", () => {
    const text = normalizeJsonText(
      JSON.stringify({
        name: "Songs",
        lists: [{ id: "l1", name: "Setlist" }],
        cards: [{ id: "c9", idList: "l1", name: "Living Waters", closed: false }],
        actions: [
          {
            type: "addAttachmentToCard",
            data: {
              card: { id: "c9" },
              attachment: {
                name: "living-waters-chords.pdf",
                mimeType: "application/pdf",
                url: "https://trello.com/1/cards/c9/attachments/z/download/living-waters-chords.pdf",
              },
            },
          },
        ],
      })
    );
    assert.match(text, /attachment \(PDF\): living-waters-chords\.pdf/);
    assert.match(text, /living-waters-chords\.pdf/);
  });

  it("caps oversized JSON", () => {
    const bulky = {
      name: "dump",
      items: Array.from({ length: 200 }, (_, i) => ({
        id: i,
        note: "x".repeat(200),
      })),
    };
    const text = normalizeJsonText(JSON.stringify(bulky), 800);
    assert.ok(text.length <= 900);
    assert.match(text, /truncated/);
  });
});
