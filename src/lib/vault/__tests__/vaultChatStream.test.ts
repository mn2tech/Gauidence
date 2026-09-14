import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeVaultChatStream,
  VAULT_CHAT_STREAM_CONTENT_TYPE,
} from "../vaultChatStream";

const encoder = new TextEncoder();

function streamResponse(lines: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
        controller.close();
      },
    }),
    { headers: { "content-type": VAULT_CHAT_STREAM_CONTENT_TYPE } }
  );
}

describe("consumeVaultChatStream", () => {
  it("delivers streamed text and the completed turn", async () => {
    const deltas: string[] = [];
    let completed = false;
    const result = await consumeVaultChatStream(
      streamResponse([
        JSON.stringify({ type: "delta", text: "Hello" }),
        JSON.stringify({
          type: "done",
          chatId: "chat-1",
          chats: [],
          messages: [],
        }),
      ]),
      {
        onDelta: (text) => deltas.push(text),
        onDone: () => {
          completed = true;
        },
      }
    );

    assert.deepEqual(deltas, ["Hello"]);
    assert.equal(completed, true);
    assert.equal(result?.chatId, "chat-1");
  });

  it("reports a stream that closes before the done event", async () => {
    let errorCode: string | undefined;
    const result = await consumeVaultChatStream(
      streamResponse([JSON.stringify({ type: "meta", chatId: "chat-1" })]),
      { onError: (_message, code) => (errorCode = code) }
    );

    assert.equal(result, null);
    assert.equal(errorCode, "stream_incomplete");
  });

  it("times out an idle response and makes it retryable", async () => {
    let errorCode: string | undefined;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: "meta", chatId: "chat-1" })}\n`)
          );
        },
      }),
      { headers: { "content-type": VAULT_CHAT_STREAM_CONTENT_TYPE } }
    );

    const result = await consumeVaultChatStream(
      response,
      { onError: (_message, code) => (errorCode = code) },
      { idleTimeoutMs: 10 }
    );

    assert.equal(result, null);
    assert.equal(errorCode, "stream_timeout");
  });
});
