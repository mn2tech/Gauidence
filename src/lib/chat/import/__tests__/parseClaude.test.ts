import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseClaudeExport } from "../parseClaude";

describe("parseClaudeExport", () => {
  it("parses flat Claude conversations", () => {
    const data = [
      {
        uuid: "conv-1",
        name: "Lease questions",
        created_at: "2026-02-14T10:04:22.000Z",
        updated_at: "2026-02-14T10:22:41.000Z",
        chat_messages: [
          {
            uuid: "m1",
            sender: "human",
            text: "When does my lease end?",
            created_at: "2026-02-14T10:04:22.000Z",
          },
          {
            uuid: "m2",
            sender: "assistant",
            content: [{ type: "text", text: "Check section 4 of your lease." }],
            created_at: "2026-02-14T10:05:00.000Z",
          },
        ],
      },
    ];

    const conversations = parseClaudeExport(data);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.externalId, "conv-1");
    assert.equal(conversations[0]?.title, "Lease questions");
    assert.equal(conversations[0]?.source, "claude");
    assert.equal(conversations[0]?.messages.length, 2);
    assert.equal(conversations[0]?.messages[0]?.role, "user");
    assert.equal(conversations[0]?.messages[1]?.content, "Check section 4 of your lease.");
  });

  it("skips conversations without messages", () => {
    const conversations = parseClaudeExport([
      { uuid: "empty", name: "Empty", chat_messages: [] },
    ]);
    assert.equal(conversations.length, 0);
  });
});
