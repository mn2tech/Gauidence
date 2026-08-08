import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatClientRequestsForGideon } from "../retrieve.ts";
import {
  scoreClientRequestRelevance,
  type ClientRequest,
  type ClientRequestComment,
} from "../types.ts";

describe("client request relevance", () => {
  const request: Pick<ClientRequest, "title" | "description" | "status"> = {
    title: "Need updated W-9",
    description: "Please upload before payroll runs Friday.",
    status: "open",
  };

  it("boosts requests when the question names the author", () => {
    const byAuthor = scoreClientRequestRelevance(
      request,
      "show the request Aaron submitted",
      { authorName: "Aaron Miller", vaultName: "crossroadconnect" }
    );
    const withoutAuthor = scoreClientRequestRelevance(
      request,
      "show the request Aaron submitted"
    );
    assert.ok(byAuthor > withoutAuthor);
  });

  it("boosts requests when the question names the client vault", () => {
    const byVault = scoreClientRequestRelevance(
      request,
      "what did crossroadconnect request",
      { vaultName: "crossroadconnect" }
    );
    const withoutVault = scoreClientRequestRelevance(
      request,
      "what did crossroadconnect request"
    );
    assert.ok(byVault > withoutVault);
  });
});

describe("formatClientRequestsForGideon", () => {
  it("formats request metadata and recent replies", () => {
    const request: ClientRequest = {
      id: "req-1",
      profile_id: "profile-client",
      created_by: "user-aaron",
      title: "Need updated W-9",
      description: "Please upload before payroll runs Friday.",
      status: "open",
      document_id: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-02T12:00:00.000Z",
      resolved_at: null,
    };
    const comments: ClientRequestComment[] = [
      {
        id: "c1",
        request_id: "req-1",
        author_user_id: "user-aaron",
        content: "Following up on this.",
        created_at: "2026-08-02T15:00:00.000Z",
      },
    ];
    const formatted = formatClientRequestsForGideon(
      [{ ...request, comments }],
      { "profile-client": "crossroadconnect" },
      { "user-aaron": "Aaron Miller" }
    );
    assert.match(formatted, /space: crossroadconnect/);
    assert.match(formatted, /submitted by: Aaron Miller/);
    assert.match(formatted, /status: Open/);
    assert.match(formatted, /Need updated W-9/);
    assert.match(formatted, /Following up on this\./);
  });
});
