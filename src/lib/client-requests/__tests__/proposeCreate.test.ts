import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatClientVaultCatalog,
  parseProposedClientRequestCreate,
  stripProposedClientRequestCreateSection,
  wantsClientRequestCreate,
} from "../proposeCreate.ts";

const CLIENT_ID = "aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee";

describe("wantsClientRequestCreate", () => {
  it("detects create intent phrases", () => {
    assert.equal(wantsClientRequestCreate("Create a client request for Aaron"), true);
    assert.equal(wantsClientRequestCreate("Open a new request for the client"), true);
    assert.equal(
      wantsClientRequestCreate("Send Aaron a request about the invoice"),
      true
    );
    assert.equal(wantsClientRequestCreate("What's the weather?"), false);
  });
});

describe("formatClientVaultCatalog", () => {
  it("lists client vault ids with names", () => {
    const catalog = formatClientVaultCatalog([CLIENT_ID], {
      [CLIENT_ID]: "Aaron",
    });
    assert.match(catalog, /Aaron/);
    assert.match(catalog, new RegExp(CLIENT_ID));
  });
});

describe("parseProposedClientRequestCreate", () => {
  it("parses a valid proposal", () => {
    const content = `I'll draft that for you.

## PROPOSED CLIENT REQUEST
profile_id: ${CLIENT_ID}
title: Invoice follow-up
description: Please upload the March invoice when you can.
initial_message: Hi Aaron — could you send the March invoice this week?
assigned_to: Jamie`;
    const parsed = parseProposedClientRequestCreate(content);
    assert.ok(parsed);
    assert.equal(parsed!.profileId, CLIENT_ID);
    assert.equal(parsed!.title, "Invoice follow-up");
    assert.match(parsed!.description, /March invoice/);
    assert.match(parsed!.initialMessage!, /Hi Aaron/);
    assert.equal(parsed!.assignedToName, "Jamie");
  });

  it("uses fallback profile id", () => {
    const content = `## PROPOSED CLIENT REQUEST
profile_id:
title: Quick question
description: Need your approval on the paint color.`;
    const parsed = parseProposedClientRequestCreate(content, CLIENT_ID);
    assert.equal(parsed?.profileId, CLIENT_ID);
  });

  it("collects multiline description", () => {
    const content = `## PROPOSED CLIENT REQUEST
profile_id: ${CLIENT_ID}
title: Site visit
description: Line one
Line two
assigned_to: Sam`;
    const parsed = parseProposedClientRequestCreate(content);
    assert.match(parsed!.description, /Line one\nLine two/);
    assert.equal(parsed!.assignedToName, "Sam");
  });
});

describe("stripProposedClientRequestCreateSection", () => {
  it("removes the proposal block", () => {
    const content = `Visible text

## PROPOSED CLIENT REQUEST
profile_id: ${CLIENT_ID}
title: Hidden
description: Hidden body`;
    const stripped = stripProposedClientRequestCreateSection(content);
    assert.match(stripped, /Visible text/);
    assert.doesNotMatch(stripped, /PROPOSED CLIENT REQUEST/);
  });
});
