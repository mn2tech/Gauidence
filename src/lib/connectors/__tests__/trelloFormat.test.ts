import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBoardAsAnalysisText } from "../trello/formatBoard.ts";

describe("trello board formatting", () => {
  it("formats lists and cards for analysis", () => {
    const text = formatBoardAsAnalysisText({
      name: "Living Waters",
      url: "https://trello.com/b/abc",
      lists: [{ id: "l1", name: "Doing" }],
      cards: [
        {
          id: "c1",
          idList: "l1",
          name: "Practice set",
          desc: "Chord charts",
          closed: false,
        },
      ],
      members: [{ fullName: "Ada" }],
    });
    assert.match(text, /Trello board: Living Waters/);
    assert.match(text, /Doing/);
    assert.match(text, /Practice set/);
    assert.match(text, /Ada/);
  });
});
