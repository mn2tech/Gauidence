import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeSpaceSwitchNote,
  rememberSpaceSwitchNote,
} from "../spaceSwitchNoteClient.ts";

describe("spaceSwitchNoteClient", () => {
  it("stores and consumes a one-shot switch note", () => {
    const store = new Map<string, string>();
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    try {
      rememberSpaceSwitchNote("  Nolan  ");
      assert.equal(consumeSpaceSwitchNote(), "Nolan");
      assert.equal(consumeSpaceSwitchNote(), null);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
