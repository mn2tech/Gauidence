import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAskVaultInventory,
  buildInventoryQuestionAnswer,
  chartFileTypeListFilter,
  formatBoundConnectedFilesForGideon,
  formatConnectedPracticeStatsLine,
  formatVaultFileListForGideon,
  practiceStatsListPrompt,
  summarizeConnectedPracticeItems,
  wantsVaultFileInventory,
} from "../askInventory.ts";

describe("ask vault inventory", () => {
  it("splits photos from documents and previews names", () => {
    const inv = buildAskVaultInventory(
      [
        { file_name: "lease.pdf", mime_type: "application/pdf" },
        { file_name: "passport.jpg", mime_type: "image/jpeg" },
        { file_name: "scan.PNG", mime_type: null },
        { file_name: "invoice.pdf", mime_type: "application/pdf" },
      ],
      [
        {
          title: "School pickup",
          log_date: "2026-07-16",
          content: "Picked up early",
        },
        {
          title: null,
          log_date: "2026-07-15",
          content: "Paid the water bill online this morning",
        },
      ]
    );

    assert.equal(inv.documentCount, 2);
    assert.equal(inv.photoCount, 2);
    assert.equal(inv.logCount, 2);
    assert.deepEqual(inv.documentNames, ["lease.pdf", "invoice.pdf"]);
    assert.deepEqual(inv.photoNames, ["passport.jpg", "scan.PNG"]);
    assert.equal(inv.logNames[0], "School pickup");
    assert.match(inv.logNames[1]!, /2026-07-15/);
  });

  it("formats per-vault file lists for Gideon", () => {
    const text = formatVaultFileListForGideon(
      [
        {
          file_name: "lease.pdf",
          mime_type: "application/pdf",
          profile_id: "vault-a",
        },
        {
          file_name: "logo.png",
          mime_type: "image/png",
          profile_id: "vault-a",
        },
        {
          file_name: "invoice.pdf",
          mime_type: "application/pdf",
          profile_id: "vault-b",
        },
      ],
      { "vault-a": "Acme Client", "vault-b": "NM2TECH" }
    );
    assert.match(text, /Acme Client/);
    assert.match(text, /Documents \(1\): lease\.pdf/);
    assert.match(text, /Photos \(1\): logo\.png/);
    assert.match(text, /NM2TECH/);
    assert.match(text, /invoice\.pdf/);
  });

  it("formats Trello files as belonging to the bound space", () => {
    const text = formatBoundConnectedFilesForGideon(
      [
        {
          name: "Just As I Am - Bb.pdf",
          cardName: "Just As I Am",
          sourceType: "trello",
          processingStatus: "analyzed",
        },
      ],
      ["Wednesday Practice"]
    );
    assert.match(text, /SPACE FILE INVENTORY/);
    assert.match(text, /Wednesday Practice/);
    assert.match(text, /Just As I Am - Bb\.pdf/);
    assert.match(text, /Trello in this space/);
  });

  it("detects inventory-style questions", () => {
    assert.equal(
      wantsVaultFileInventory(
        "What do I have in my Personal space about Nolan?"
      ),
      true
    );
    assert.equal(wantsVaultFileInventory("What files are uploaded?"), true);
    assert.equal(wantsVaultFileInventory("When is my passport due?"), false);
    assert.equal(
      wantsVaultFileInventory("What songs are on The Living Waters?"),
      true
    );
    assert.equal(wantsVaultFileInventory("give me the list of songs"), true);
  });

  it("lists songs from connected Trello inventory lines", () => {
    const answer = buildInventoryQuestionAnswer({
      question: "What songs are on The Living Waters?",
      spaceDisplayName: "Wednesday Practice",
      fileInventoryText: `SPACE FILE INVENTORY (Trello / connected files in Wednesday Practice — treat these as files in this space, not only on the connection):
- Silent Night Holy Night - C.jpg · Silent Night Holy Night (Trello in this space, analyzed)
- As the deer - C.jpg · As the deer (Trello in this space, discovered)
- Asha Meri - Eb5 - Short version.jpg · Asha Meri (Trello in this space, analyzed)
- Pasted - Wednesday Practice.txt (Trello in this space, analyzed)
- Ay hamaare Baap - Oct 10, 2021.jpg · Ay hamaare Baap - Oct 10, 2021 (Trello in this space, analyzed)
- Ay hamaare Baap.jpg · Ay hamaare Baap (Trello in this space, discovered)`,
    });
    assert.ok(answer);
    assert.match(answer!, /Silent Night Holy Night/);
    assert.match(answer!, /As the deer/);
    assert.match(answer!, /Asha Meri/);
    assert.match(answer!, /Ay hamaare Baap/);
    assert.equal((answer!.match(/Ay hamaare Baap/g) ?? []).length, 1);
    assert.doesNotMatch(answer!, /Pasted/);
    assert.doesNotMatch(answer!, /\.txt/);
    assert.match(answer!, /Wednesday Practice/);
  });

  it("filters admin and practice-session cards out of song lists", () => {
    const answer = buildInventoryQuestionAnswer({
      question: "Song list",
      spaceDisplayName: "Wednesday Practice",
      fileInventoryText: `SPACE FILE INVENTORY:
- chart.jpg · Great is Thy Faithfulness (Trello in this space, analyzed)
- chart2.jpg · Sep 3rd Practice Session(#4) (Trello in this space, analyzed)
- chart3.jpg · Mikey - Add Sujay to Bank Account (Trello in this space, analyzed)
- chart4.jpg · 6. Vesaarina (Singers - Frieda and Joyce, Music-Track) (Trello in this space, analyzed)`,
    });
    assert.ok(answer);
    assert.match(answer!, /Great is Thy Faithfulness/);
    assert.match(answer!, /Vesaarina/);
    assert.doesNotMatch(answer!, /Practice Session/);
    assert.doesNotMatch(answer!, /Bank Account/);
    assert.doesNotMatch(answer!, /^• 6\./m);
  });

  it("builds a scoped inventory answer about a topic", () => {
    const answer = buildInventoryQuestionAnswer({
      question: "What do I have in my Personal space about Nolan?",
      spaceDisplayName: "Michael Kola",
      fileInventoryText: `Michael Kola:
Photos (9): spider-man.png, license.jpg, wedding.jpg, tickets.png, screen1.png, screen2.png, screen3.png, screen4.png, screen5.png`,
    });
    assert.ok(answer);
    assert.match(answer!, /Michael Kola/);
    assert.match(answer!, /Nolan/i);
    assert.match(answer!, /don't see|do not see|nothing/i);
  });

  it("lists matching files when the topic appears in file names", () => {
    const answer = buildInventoryQuestionAnswer({
      question: "What do I have about Nolan?",
      spaceDisplayName: "Nolan Kola",
      fileInventoryText: `Nolan Kola:
Documents (2): Nolan report.pdf, homework.pdf
Photos (1): summer.jpg`,
    });
    assert.match(answer!, /Nolan report\.pdf/);
  });
});

describe("connected practice stats", () => {
  it("counts songs, JPGs, and PDFs from Trello chart items", () => {
    const stats = summarizeConnectedPracticeItems([
      {
        name: "board.txt",
        mime_type: "text/plain",
        metadata: { kind: "board" },
      },
      {
        name: "trello1.jpg",
        mime_type: "image/jpeg",
        metadata: { kind: "attachment", cardName: "What a Beautiful Name - C" },
      },
      {
        name: "trello2.jpg",
        mime_type: "image/jpeg",
        metadata: { kind: "attachment", cardName: "What a Beautiful Name - Bb" },
      },
      {
        name: "trello3.jpg",
        mime_type: "image/jpeg",
        metadata: { kind: "attachment", cardName: "Lord Send Revival - G" },
      },
      {
        name: "chart.pdf",
        mime_type: "application/pdf",
        metadata: { kind: "attachment", cardName: "Silent Night - C" },
      },
    ]);
    assert.equal(stats.jpgCount, 3);
    assert.equal(stats.pdfCount, 1);
    assert.equal(stats.chartCount, 4);
    assert.equal(stats.songCount, 3);
    assert.match(
      formatConnectedPracticeStatsLine(stats, "Living Waters")!,
      /Living Waters: 3 songs · 3 JPGs · 1 PDF/
    );
  });

  it("builds list prompts for practice-stat chips", () => {
    assert.equal(
      practiceStatsListPrompt("songs", "Living Waters"),
      "What songs are on Living Waters?"
    );
    assert.equal(
      practiceStatsListPrompt("jpg"),
      "List the JPG chord charts in this space"
    );
    assert.equal(chartFileTypeListFilter("List the JPG chord charts in this space"), "jpg");
    assert.equal(chartFileTypeListFilter("List the PDF chord charts in this space"), "pdf");
  });

  it("lists JPG charts from inventory text", () => {
    const answer = buildInventoryQuestionAnswer({
      question: "List the JPG chord charts in this space",
      spaceDisplayName: "Wednesday Practice",
      fileInventoryText: `SPACE FILE INVENTORY (Trello / connected files in Wednesday Practice — treat these as files in this space, not only on the connection):
- trello1.jpg · What a Beautiful Name - C (Trello in this space, analyzed)
- chart.pdf · Silent Night - C (Trello in this space, analyzed)
- trello2.jpg · Lord Send Revival - G (Trello in this space, analyzed)`,
    });
    assert.match(answer!, /JPG charts/);
    assert.match(answer!, /What a Beautiful Name/);
    assert.match(answer!, /Lord Send Revival/);
    assert.doesNotMatch(answer!, /Silent Night/);
  });
});
