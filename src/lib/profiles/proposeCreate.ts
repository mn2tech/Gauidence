import {
  canAttachChildToParent,
  isFamilyMemberType,
  isGuardianProfileType,
  isOrgStyleProfile,
  PROFILE_CREATE_OPTIONS,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
  type GuardianProfileType,
} from "./types";
import { getContainerLabel } from "./containerLabels";

export type SpaceParentPlacement = "top_level" | "under_parent";

export type ProposedSpaceCreate = {
  displayName: string;
  profileType: GuardianProfileType;
  optionId?: string;
  parentPlacement: SpaceParentPlacement;
  parentProfileId?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SPACE_CREATE_INTENT =
  /\b(create|add|make|start|open|set\s+up)\b.{0,48}\b(?:new\s+)?(?:a\s+)?(?:\w+(?:'s)?\s+)?(?:spaces?|workspaces?)\b/i;

const SPACE_CREATE_ALT =
  /\b(new|another)\s+(?:family|business|personal|client|employee|nonprofit|teacher|student|project|learning)\s+(?:space|workspace)\b/i;

const SPACE_CREATE_FOR =
  /\b(create|add|make)\b.{0,24}\b(?:a\s+)?(?:space|workspace)\s+(?:for|called|named)\b/i;

const SPACE_CREATE_QUERY =
  /\b(what|which|how\s+many|list|show|where|tell\s+me\s+about)\b.{0,40}\b(spaces?|workspaces?)\b/i;

const CLIENT_REQUEST_CREATE =
  /\b(client\s+)?requests?\b/i;

/** Profile types that must be nested under a container — never default to the active space. */
export function profileTypeRequiresParent(type: GuardianProfileType): boolean {
  return (
    type === "employee" ||
    type === "client" ||
    isFamilyMemberType(type)
  );
}

/** Parents that may hold this child profile type. */
export function validParentProfilesForChild(
  profiles: Pick<GuardianProfile, "id" | "display_name" | "profile_type">[],
  childType: GuardianProfileType
): Pick<GuardianProfile, "id" | "display_name" | "profile_type">[] {
  return profiles.filter((p) =>
    canAttachChildToParent(childType, p.profile_type)
  );
}

/** True when the user wants Gideon to propose creating a new space or workspace. */
export function wantsSpaceCreate(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (SPACE_CREATE_QUERY.test(q)) return false;
  if (CLIENT_REQUEST_CREATE.test(q) && /\brequest\b/i.test(q)) return false;
  if (SPACE_CREATE_INTENT.test(q)) return true;
  if (SPACE_CREATE_ALT.test(q)) return true;
  if (SPACE_CREATE_FOR.test(q)) return true;
  return false;
}

function optionIdForType(type: GuardianProfileType): string | undefined {
  return PROFILE_CREATE_OPTIONS.find((o) => o.profileType === type)?.id;
}

export function formatSpaceCreateCatalog(
  profiles: Pick<GuardianProfile, "id" | "display_name" | "profile_type">[]
): string {
  const roots = topLevelProfiles(profiles as GuardianProfile[]);
  const topLevel = roots.map((p) => {
    const kind = getContainerLabel(p.profile_type).toLowerCase();
    return `- ${p.display_name} (${kind}) → profile_id: ${p.id}`;
  });
  const parents = profiles
    .filter(
      (p) =>
        p.profile_type === "family" || isOrgStyleProfile(p.profile_type)
    )
    .map((p) => {
      const kind = getContainerLabel(p.profile_type).toLowerCase();
      return `- ${p.display_name} (${kind}, may hold nested spaces) → profile_id: ${p.id}`;
    });
  const options = PROFILE_CREATE_OPTIONS.map(
    (o) => `- ${o.label} → option_id: ${o.id}, profile_type: ${o.profileType}`
  );
  return [
    "TOP-LEVEL SPACES (independent — preferred default):",
    topLevel.length > 0 ? topLevel.join("\n") : "(none yet)",
    "",
    "CONTAINER SPACES (only use as parent when the user names one):",
    parents.length > 0 ? parents.join("\n") : "(none)",
    "",
    "SPACE TYPES:",
    options.join("\n"),
  ].join("\n");
}

export function spaceCreateSystemNote(
  catalog: string,
  activeProfileId: string,
  activeProfileName: string
): string {
  return `Space create mode:
The user wants to create a new Space or Workspace. Acknowledge briefly, then propose the new space.

Placement rules (strict):
- Default parent_placement: top_level for business, family, personal, nonprofit, teacher, student, home, vehicle, pet, hobby, and other standalone spaces.
- NEVER nest under the active space (${activeProfileName}, profile_id: ${activeProfileId}) unless the user explicitly names that space as the parent.
- Use parent_placement: under_parent only when the user clearly names a parent space (e.g. "under my family space", "in NM2TECH").
- For employee, client, or family-member spaces, parent_placement must be under_parent with a valid parent_profile_id from CONTAINER SPACES below.
- If placement is ambiguous, use top_level and say they can choose where it lives when they confirm.

End with exactly:

## PROPOSED SPACE
display_name: <name under 120 characters>
profile_type: <Guardian profile_type, e.g. business, family, client, employee>
option_id: <matching option_id from SPACE TYPES — optional but preferred>
parent_placement: top_level | under_parent
parent_profile_id: <uuid only when parent_placement is under_parent>

${catalog}

Never invent profile_id values. Do not create the space yourself — the user will confirm placement in the app.`;
}

const SECTION_START = /^#{1,3}\s*PROPOSED SPACE\s*$/i;

function trimField(value: string | undefined, max = 4000): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeProfileType(raw: string): GuardianProfileType | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliases: Record<string, GuardianProfileType> = {
    nonprofit: "non_profit",
    non_profit: "non_profit",
    spouse: "spouse_partner",
    spouse_partner: "spouse_partner",
    family_member: "family_member",
    learning: "hobby",
    project: "other",
    workspace: "business",
  };
  const mapped = aliases[t] ?? t;
  return isGuardianProfileType(mapped) ? mapped : null;
}

/** Pull a structured new space proposal from Gideon markdown. */
export function parseProposedSpaceCreate(
  content: string
): ProposedSpaceCreate | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};

  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed)) break;
    if (!trimmed) continue;

    const m =
      /^(display_name|displayname|profile_type|profiletype|option_id|optionid|parent_placement|parentplacement|parent_profile_id|parentprofileid)\s*:\s*(.*)$/i.exec(
        trimmed
      );
    if (m) {
      const key = m[1]!.toLowerCase().replace(/_/g, "");
      fields[key] = m[2]!.trim();
    }
  }

  const displayName = trimField(fields.displayname, 120);
  if (!displayName) return null;

  let profileType = normalizeProfileType(fields.profiletype ?? "");
  const optionId = trimField(fields.optionid, 40);
  if (!profileType && optionId) {
    const option = PROFILE_CREATE_OPTIONS.find((o) => o.id === optionId);
    profileType = option?.profileType ?? null;
  }
  if (!profileType) return null;

  const placementRaw = (fields.parentplacement ?? "top_level")
    .toLowerCase()
    .replace(/\s+/g, "_");
  let parentPlacement: SpaceParentPlacement =
    placementRaw === "under_parent" || placementRaw === "under"
      ? "under_parent"
      : "top_level";

  const parentProfileId = trimField(fields.parentprofileid, 80);
  if (parentPlacement === "under_parent") {
    if (!parentProfileId || !UUID_RE.test(parentProfileId)) return null;
  } else if (profileTypeRequiresParent(profileType)) {
    if (parentProfileId && UUID_RE.test(parentProfileId)) {
      parentPlacement = "under_parent";
    } else {
      return null;
    }
  }

  return {
    displayName,
    profileType,
    ...(optionId ? { optionId } : {}),
    ...(optionIdForType(profileType) && !optionId
      ? { optionId: optionIdForType(profileType) }
      : {}),
    parentPlacement,
    ...(parentPlacement === "under_parent" && parentProfileId
      ? { parentProfileId }
      : {}),
  };
}

/** Remove the proposal section from displayed chat text. */
export function stripProposedSpaceCreateSection(content: string): string {
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

export function proposedSpaceCreateSummary(
  proposal: ProposedSpaceCreate,
  parentName?: string | null
): string {
  const kind = getContainerLabel(proposal.profileType);
  const placement =
    proposal.parentPlacement === "under_parent" && parentName
      ? ` under ${parentName}`
      : proposal.parentPlacement === "top_level"
        ? " (top level)"
        : "";
  return `${proposal.displayName} — ${kind}${placement}`;
}

export function defaultParentChoice(
  proposal: ProposedSpaceCreate,
  profiles: Pick<GuardianProfile, "id" | "display_name" | "profile_type">[],
  activeProfileId: string | null
): string | null {
  if (proposal.parentPlacement === "under_parent" && proposal.parentProfileId) {
    return proposal.parentProfileId;
  }
  if (profileTypeRequiresParent(proposal.profileType)) {
    const valid = validParentProfilesForChild(profiles, proposal.profileType);
    if (valid.length === 1) return valid[0]!.id;
    if (
      proposal.parentProfileId &&
      valid.some((p) => p.id === proposal.parentProfileId)
    ) {
      return proposal.parentProfileId;
    }
    return valid[0]?.id ?? null;
  }
  if (proposal.parentPlacement === "top_level") return null;
  if (
    proposal.parentProfileId &&
    profiles.some((p) => p.id === proposal.parentProfileId)
  ) {
    return proposal.parentProfileId;
  }
  // Never default to active profile for ambiguous nesting.
  if (activeProfileId && proposal.parentProfileId === activeProfileId) {
    return activeProfileId;
  }
  return null;
}

export function spaceCreatePlacementLabel(
  proposal: ProposedSpaceCreate,
  parentId: string | null,
  profiles: Pick<GuardianProfile, "id" | "display_name" | "profile_type">[]
): string {
  if (!parentId) {
    return `New top-level ${getContainerLabel(proposal.profileType).toLowerCase()}`;
  }
  const parent = profiles.find((p) => p.id === parentId);
  const parentName = parent?.display_name ?? "parent space";
  return `Under ${parentName} (${profileTypeLabel(proposal.profileType)})`;
}
