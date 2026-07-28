import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clipboardImageToFile } from "../clipboardImage.ts";

function mockClipboardData(file: File): DataTransfer {
  const item = {
    kind: "file",
    type: file.type,
    getAsFile: () => file,
  };
  return {
    items: [item],
    files: [file],
  } as DataTransfer;
}

describe("clipboard image paste", () => {
  it("extracts a PNG screenshot from clipboard items", () => {
    const blob = new File([new Uint8Array([1, 2, 3])], "image.png", {
      type: "image/png",
    });
    const file = clipboardImageToFile(mockClipboardData(blob));
    assert.ok(file);
    assert.equal(file.type, "image/png");
    assert.match(file.name, /^screenshot-\d+\.png$/);
  });

  it("keeps a named photo file from clipboard", () => {
    const blob = new File([new Uint8Array([1, 2, 3])], "receipt-scan.jpg", {
      type: "image/jpeg",
    });
    const file = clipboardImageToFile(mockClipboardData(blob));
    assert.ok(file);
    assert.equal(file.name, "receipt-scan.jpg");
    assert.equal(file.type, "image/jpeg");
  });

  it("returns null when clipboard has no supported image", () => {
    const blob = new File(["hello"], "note.txt", { type: "text/plain" });
    const file = clipboardImageToFile(mockClipboardData(blob));
    assert.equal(file, null);
  });
});
