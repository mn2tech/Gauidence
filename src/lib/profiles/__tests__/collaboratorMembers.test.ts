import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";

describe("collaboratorDisplayName", () => {
  it("prefers full name", () => {
    assert.equal(
      collaboratorDisplayName({
        fullName: "Sujay Polimati",
        email: "sujay@example.com",
      }),
      "Sujay Polimati"
    );
  });

  it("falls back to email", () => {
    assert.equal(
      collaboratorDisplayName({ fullName: null, email: "sujay@example.com" }),
      "sujay@example.com"
    );
  });

  it("falls back to Editor when unknown", () => {
    assert.equal(collaboratorDisplayName(null), "Editor");
    assert.equal(
      collaboratorDisplayName({ fullName: "", email: "  " }),
      "Editor"
    );
  });
});
