import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChatGptExport } from "../parseChatGpt";

describe("parseChatGptExport", () => {
  it("follows the active branch via current_node", () => {
    const data = [
      {
        id: "conv-1",
        conversation_id: "conv-1",
        title: "Branch test",
        create_time: 1_736_209_400,
        update_time: 1_736_209_800,
        current_node: "msg-2",
        mapping: {
          root: {
            id: "root",
            message: null,
            parent: null,
            children: ["msg-1"],
          },
          "msg-1": {
            id: "msg-1",
            message: {
              author: { role: "user" },
              content: { content_type: "text", parts: ["Hello"] },
              create_time: 1_736_209_410,
            },
            parent: "root",
            children: ["msg-2", "msg-2-alt"],
          },
          "msg-2": {
            id: "msg-2",
            message: {
              author: { role: "assistant" },
              content: { content_type: "text", parts: ["Hi there"] },
              create_time: 1_736_209_420,
            },
            parent: "msg-1",
            children: [],
          },
          "msg-2-alt": {
            id: "msg-2-alt",
            message: {
              author: { role: "assistant" },
              content: { content_type: "text", parts: ["Wrong branch"] },
              create_time: 1_736_209_425,
            },
            parent: "msg-1",
            children: [],
          },
        },
      },
    ];

    const conversations = parseChatGptExport(data);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.messages.length, 2);
    assert.equal(conversations[0]?.messages[0]?.content, "Hello");
    assert.equal(conversations[0]?.messages[1]?.content, "Hi there");
  });

  it("skips system messages", () => {
    const data = [
      {
        id: "conv-2",
        title: "System only",
        current_node: "sys",
        mapping: {
          sys: {
            id: "sys",
            message: {
              author: { role: "system" },
              content: { parts: ["You are helpful."] },
            },
            parent: null,
            children: [],
          },
        },
      },
    ];

    const conversations = parseChatGptExport(data);
    assert.equal(conversations.length, 0);
  });
});
