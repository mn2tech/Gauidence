import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFileType, countByCategory, extensionOf } from "../classify";

describe("file type classification", () => {
  it("classifies images by extension", () => {
    assert.equal(classifyFileType("photo.JPG"), "Images");
    assert.equal(classifyFileType("a.webp"), "Images");
    assert.equal(classifyFileType("x.heic"), "Images");
  });

  it("classifies pdf, documents, spreadsheets, text", () => {
    assert.equal(classifyFileType("a.pdf"), "PDF");
    assert.equal(classifyFileType("a.docx"), "Documents");
    assert.equal(classifyFileType("a.xlsx"), "Spreadsheets");
    assert.equal(
      classifyFileType("Budget", "application/vnd.google-apps.document"),
      "Documents"
    );
    assert.equal(
      classifyFileType("Budget", "application/vnd.google-apps.spreadsheet"),
      "Spreadsheets"
    );
    assert.equal(classifyFileType("notes.txt"), "Text");
    assert.equal(classifyFileType("readme.md"), "Text");
    assert.equal(classifyFileType("export.json"), "Text");
    assert.equal(classifyFileType("blob", "application/json"), "Text");
  });

  it("falls back to mime type and Other", () => {
    assert.equal(classifyFileType("blob", "image/png"), "Images");
    assert.equal(classifyFileType("blob", "application/pdf"), "PDF");
    assert.equal(classifyFileType("weird.bin"), "Other");
  });

  it("counts categories", () => {
    const counts = countByCategory([
      { name: "a.jpg" },
      { name: "b.pdf" },
      { name: "c.pdf" },
      { name: "d.csv" },
    ]);
    assert.equal(counts.Images, 1);
    assert.equal(counts.PDF, 2);
    assert.equal(counts.Spreadsheets, 1);
  });

  it("extensionOf handles edge cases", () => {
    assert.equal(extensionOf("a.b.c.txt"), "txt");
    assert.equal(extensionOf(".gitignore"), "");
    assert.equal(extensionOf("noext"), "");
  });
});
