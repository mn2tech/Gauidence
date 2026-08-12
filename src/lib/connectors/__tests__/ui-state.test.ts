import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ConnectedSourceStatus } from "../types";

/** UI state machine for Phone Storage card (unit-level). */
export function phoneCardState(
  status: ConnectedSourceStatus | null | undefined
): "not_connected" | "connected" | "permission_revoked" | "disconnected" | "error" {
  if (!status || status === "disconnected") return "not_connected";
  if (status === "permission_revoked") return "permission_revoked";
  if (status === "error") return "error";
  if (status === "connected") return "connected";
  return "not_connected";
}

export function scanningLabel(busy: string | null): string | null {
  if (busy === "scan" || busy === "connect") return "scanning";
  return null;
}

describe("phone storage UI states", () => {
  it("not connected when missing or disconnected", () => {
    assert.equal(phoneCardState(null), "not_connected");
    assert.equal(phoneCardState("disconnected"), "not_connected");
  });

  it("connected and permission revoked", () => {
    assert.equal(phoneCardState("connected"), "connected");
    assert.equal(phoneCardState("permission_revoked"), "permission_revoked");
  });

  it("error state", () => {
    assert.equal(phoneCardState("error"), "error");
  });

  it("scanning busy flag", () => {
    assert.equal(scanningLabel("scan"), "scanning");
    assert.equal(scanningLabel("connect"), "scanning");
    assert.equal(scanningLabel(null), null);
  });
});
