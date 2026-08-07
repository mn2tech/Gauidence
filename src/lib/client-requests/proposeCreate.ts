const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProposedClientRequestCreate = {
  profileId: string;
  title: string;
  description: string;
  initialMessage?: string;
  assignedToName?: string;
};

const CLIENT_REQUEST_CREATE_INTENT =
  /\b(create|new|add|start|make)\b.{0,40}\b(client\s+)?requests?\b/i;

const CLIENT_REQUEST_OPEN_CREATE =
  /\bopen\b(?:\s+\w+){0,4}\s+(?:a\s+)?new\s+(?:client\s+)?requests?\b/i;

const CLIENT_REQUEST_CREATE_ALT =
  /\b(request|requests)\b.{0,24}\b(for|on|with)\b.{0,40}\b(client|customer)\b/i;

const CLIENT_REQUEST_SEND_GIVE =
  /\b(send|give)\b.{0,48}\brequest\b/i;

/** True when the user wants Gideon to propose a new client request. */
export function wantsClientRequestCreate(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (CLIENT_REQUEST_CREATE_INTENT.test(q)) return true;
  if (CLIENT_REQUEST_OPEN_CREATE.test(q)) return true;
  if (CLIENT_REQUEST_CREATE_ALT.test(q)) return true;
  if (CLIENT_REQUEST_SEND_GIVE.test(q)) return true;
  return false;
}

export function formatClientVaultCatalog(
  clientProfileIds: string[],
  profileNames: Record<string, string>
): string {
  if (clientProfileIds.length === 0) {
    return "(no client vaults in scope — client requests require a client vault profile_id)";
  }
  return clientProfileIds
    .map((id) => {
      const name = profileNames[id]?.trim() || "Client";
      return `- ${name} → profile_id: ${id}`;
    })
    .join("\n");
}

export function clientRequestCreateSystemNote(
  clientVaultCatalog: string,
  activeProfileId: string,
  activeProfileType: string
): string {
  const activeHint =
    activeProfileType === "client"
      ? `The active profile is a client vault — use profile_id: ${activeProfileId} unless the user names a different client.`
      : `Pick profile_id from CLIENT VAULTS below when the user names a client. If only one client vault exists, use it.`;

  return `Client request create mode:
The user wants to open a new client request thread on a client vault (for communication with that client). ${activeHint}

Acknowledge briefly, then propose the request. End with exactly:

## PROPOSED CLIENT REQUEST
profile_id: <uuid from CLIENT VAULTS or active client vault>
title: <short title under 200 characters>
description: <details the client and your team will see — plain text; may continue on following lines>
initial_message: <optional first reply in the thread — omit if description is enough>
assigned_to: <optional employee name on your team to own this internally — never the client>

CLIENT VAULTS:
${clientVaultCatalog}

Never invent profile_id values. Never assign the client themselves — assigned_to is for internal employees only. Omit assigned_to unless the user names a teammate. Do not create the request yourself — the user will confirm in the app.`;
}

const SECTION_START = /^#{1,3}\s*PROPOSED CLIENT REQUEST\s*$/i;

function trimField(value: string | undefined, max = 4000): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/** Pull a structured new client request from Gideon markdown. */
export function parseProposedClientRequestCreate(
  content: string,
  fallbackProfileId?: string | null
): ProposedClientRequestCreate | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  const descriptionLines: string[] = [];
  let collectingDescription = false;
  let collectingInitialMessage = false;
  const initialMessageLines: string[] = [];

  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed)) break;

    if (collectingInitialMessage) {
      const fieldMatch =
        /^(profile_id|profileid|title|description|assigned_to|assignedto)\s*:\s*(.*)$/i.exec(
          trimmed
        );
      if (fieldMatch) {
        collectingInitialMessage = false;
        const key = fieldMatch[1]!.toLowerCase().replace(/_/g, "");
        fields[key] = fieldMatch[2]!.trim();
        if (key === "description") collectingDescription = true;
        continue;
      }
      initialMessageLines.push(line);
      continue;
    }

    if (collectingDescription) {
      const fieldMatch =
        /^(profile_id|profileid|title|initial_message|initialmessage|assigned_to|assignedto)\s*:\s*(.*)$/i.exec(
          trimmed
        );
      if (fieldMatch) {
        collectingDescription = false;
        const key = fieldMatch[1]!.toLowerCase().replace(/_/g, "");
        const val = fieldMatch[2]!.trim();
        if (key === "initialmessage") {
          collectingInitialMessage = true;
          if (val) initialMessageLines.push(val);
        } else {
          fields[key] = val;
        }
        continue;
      }
      descriptionLines.push(line);
      continue;
    }

    if (!trimmed) continue;

    const m =
      /^(profile_id|profileid|title|description|initial_message|initialmessage|assigned_to|assignedto)\s*:\s*(.*)$/i.exec(
        trimmed
      );
    if (m) {
      const key = m[1]!.toLowerCase().replace(/_/g, "");
      const val = m[2]!.trim();
      if (key === "description") {
        collectingDescription = true;
        if (val) descriptionLines.push(val);
      } else if (key === "initialmessage") {
        collectingInitialMessage = true;
        if (val) initialMessageLines.push(val);
      } else {
        fields[key] = val;
      }
      continue;
    }

    if (fields.description !== undefined) {
      collectingDescription = true;
      descriptionLines.push(line);
    }
  }

  const profileId = (
    fields.profileid?.trim() ||
    fallbackProfileId?.trim() ||
    ""
  ).trim();
  if (!UUID_RE.test(profileId)) return null;

  const title = trimField(fields.title, 200);
  const description = trimField(descriptionLines.join("\n").trim());
  if (!title || !description) return null;

  const initialMessage = trimField(initialMessageLines.join("\n").trim());
  const assignedToName = trimField(fields.assignedto, 120);

  return {
    profileId,
    title,
    description,
    ...(initialMessage ? { initialMessage } : {}),
    ...(assignedToName ? { assignedToName } : {}),
  };
}

/** Remove the proposal section from displayed chat text. */
export function stripProposedClientRequestCreateSection(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (SECTION_START.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s+\S/.test(line.trim())) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

export function proposedClientRequestCreateSummary(
  proposal: ProposedClientRequestCreate,
  clientName?: string | null
): string {
  const who = clientName?.trim() ? `for ${clientName.trim()}` : "for client vault";
  const preview =
    proposal.description.length > 100
      ? `${proposal.description.slice(0, 97)}…`
      : proposal.description;
  const assignNote = proposal.assignedToName
    ? ` · assign ${proposal.assignedToName}`
    : "";
  return `"${proposal.title}" ${who}${assignNote}: ${preview}`;
}
