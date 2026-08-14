import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boardsForTrelloScan,
  itemBelongsToTrelloBoard,
  sortTrelloBoardsForPicker,
  trelloSelectedBoardId,
} from "../trello/selectedBoard.ts";

describe("trello selected board", () => {
  it("reads boardId from settings", () => {
    assert.equal(trelloSelectedBoardId({ boardId: "b1" }), "b1");
    assert.equal(trelloSelectedBoardId({}), null);
  });

  it("scans only the selected board", () => {
    const boards = [
      { id: "a", name: "Other" },
      { id: "lw", name: "Living Waters" },
    ];
    assert.deepEqual(boardsForTrelloScan(boards, "lw"), [
      { id: "lw", name: "Living Waters" },
    ]);
  });

  it("scans every board when none is selected", () => {
    const boards = [
      { id: "a", name: "Other" },
      { id: "lw", name: "Living Waters" },
    ];
    assert.equal(boardsForTrelloScan(boards, null).length, 2);
  });

  it("puts Living Waters first in the picker", () => {
    const sorted = sortTrelloBoardsForPicker([
      { name: "Zoo" },
      { name: "Living Waters" },
      { name: "Alpha" },
    ]);
    assert.equal(sorted[0]?.name, "Living Waters");
  });

  it("keeps attachments on the selected board", () => {
    assert.equal(
      itemBelongsToTrelloBoard(
        {
          metadata: { kind: "attachment", boardId: "lw" },
        },
        "lw"
      ),
      true
    );
    assert.equal(
      itemBelongsToTrelloBoard(
        {
          metadata: { kind: "attachment", boardId: "other" },
        },
        "lw"
      ),
      false
    );
    assert.equal(
      itemBelongsToTrelloBoard(
        { externalId: "lw", metadata: { kind: "board" } },
        "lw"
      ),
      true
    );
    assert.equal(
      itemBelongsToTrelloBoard(
        { processingStatus: "unavailable", metadata: { kind: "board" } },
        "lw"
      ),
      false
    );
  });
});
