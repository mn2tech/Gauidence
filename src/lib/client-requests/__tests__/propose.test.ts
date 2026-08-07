import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProposedClientRequestReply,
  stripProposedClientRequestReplySection,
  wantsClientRequestReply,
} from "../propose.ts";

describe("wantsClientRequestReply", () => {
  it("detects reply intent", () => {
    assert.equal(
      wantsClientRequestReply("Reply to the client on their open request"),
      true
    );
    assert.equal(wantsClientRequestReply("What's the weather?"), false);
  });

  it("does not treat create intent as reply", () => {
    assert.equal(wantsClientRequestReply("Create a client request for Aaron"), false);
    assert.equal(
      wantsClientRequestReply("Send Aaron a request about the invoice"),
      false
    );
  });
});

describe("parseProposedClientRequestReply", () => {
  const fallback = "aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee";

  it("parses a valid proposal", () => {
    const content = `Here is a draft.

## PROPOSED CLIENT REQUEST REPLY
request_id: aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee
status: in_progress
content: Thanks for reaching out — we will send the files today.`;
    const parsed = parseProposedClientRequestReply(content);
    assert.ok(parsed);
    assert.equal(parsed!.requestId, fallback);
    assert.equal(parsed!.status, "in_progress");
    assert.match(parsed!.content, /Thanks for reaching out/);
  });

  it("uses fallback request id", () => {
    const content = `## PROPOSED CLIENT REQUEST REPLY
request_id: 
content: On it.`;
    const parsed = parseProposedClientRequestReply(content, fallback);
    assert.equal(parsed?.requestId, fallback);
  });
});

describe("stripProposedClientRequestReplySection", () => {
  it("removes the proposal block", () => {
    const content = `Visible text

## PROPOSED CLIENT REQUEST REPLY
request_id: aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee
content: Hidden`;
    const stripped = stripProposedClientRequestReplySection(content);
    assert.match(stripped, /Visible text/);
    assert.doesNotMatch(stripped, /PROPOSED CLIENT REQUEST REPLY/);
  });
});
