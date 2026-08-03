import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProposedWorkMemoryUpdate,
  stripProposedWorkMemoryUpdateSection,
  wantsWorkMemoryUpdate,
} from "../propose.ts";

const PROJECT_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("work memory propose", () => {
  it("detects update intent", () => {
    assert.equal(wantsWorkMemoryUpdate("Update the project status"), true);
    assert.equal(wantsWorkMemoryUpdate("Save this to work memory"), true);
    assert.equal(wantsWorkMemoryUpdate("What is the due date?"), false);
    assert.equal(
      wantsWorkMemoryUpdate("Mark it ready", { focusedWorkProject: true }),
      true
    );
  });

  it("parses a valid proposal", () => {
    const content = `Here is the update.

## PROPOSED WORK MEMORY UPDATE
project_id: ${PROJECT_ID}
status: waiting
current_step: Booth materials ordered
next_action: Attend event
`;
    const proposal = parseProposedWorkMemoryUpdate(content);
    assert.ok(proposal);
    assert.equal(proposal?.projectId, PROJECT_ID);
    assert.equal(proposal?.status, "waiting");
    assert.equal(proposal?.currentStep, "Booth materials ordered");
    assert.equal(proposal?.nextAction, "Attend event");
  });

  it("maps ready status to waiting", () => {
    const content = `## PROPOSED WORK MEMORY UPDATE
project_id: ${PROJECT_ID}
status: ready
next_action: Go
`;
    const proposal = parseProposedWorkMemoryUpdate(content);
    assert.equal(proposal?.status, "waiting");
  });

  it("strips proposal section from display", () => {
    const content = `Summary text.

## PROPOSED WORK MEMORY UPDATE
project_id: ${PROJECT_ID}
next_action: Ship it
`;
    const stripped = stripProposedWorkMemoryUpdateSection(content);
    assert.match(stripped, /Summary text/);
    assert.doesNotMatch(stripped, /PROPOSED WORK MEMORY UPDATE/);
  });
});
