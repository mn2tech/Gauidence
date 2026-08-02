import {
  clientsOf,
  employeesOf,
  familyMembersOf,
  homesOf,
  isOrgStyleProfile,
  nestedUnder,
  otherSpacesOf,
  petsOf,
  hobbiesOf,
  profileTypeLabel,
  studentsOf,
  topLevelProfiles,
  vehiclesOf,
  type GuardianProfile,
  type GuardianProfileType,
} from "@/lib/profiles/types";

/** Labeled roster under a container (Employees, Clients, Family members, Things). */
export type VaultMapMemberGroup = {
  label: string;
  members: GuardianProfile[];
};

/** One top-level space under the account owner. */
export type VaultMapBranch = {
  profile: GuardianProfile;
  /** Labeled sections under this space (preferred over flat members). */
  groups: VaultMapMemberGroup[];
  /** Fallback flat list when there are no labeled groups. */
  members: GuardianProfile[];
};

/** Full account tree for the vault map. */
export type VaultMapTree = {
  ownerLabel: string;
  /** Personal vault when the user has a top-level "personal" space. */
  personalProfile: GuardianProfile | null;
  branches: VaultMapBranch[];
};

/** Prefer Family, then Business / Nonprofit, then Vehicles, then the rest. */
const BRANCH_ORDER: Partial<Record<GuardianProfileType, number>> = {
  family: 0,
  business: 1,
  non_profit: 2,
  vehicles: 3,
};

function branchRank(type: GuardianProfileType): number {
  return BRANCH_ORDER[type] ?? 10;
}

function branchForProfile(
  profiles: GuardianProfile[],
  profile: GuardianProfile
): VaultMapBranch {
  if (isOrgStyleProfile(profile.profile_type)) {
    const others = otherSpacesOf(profiles, profile.id);
    return {
      profile,
      groups: [
        { label: "Employees", members: employeesOf(profiles, profile.id) },
        { label: "Clients", members: clientsOf(profiles, profile.id) },
        ...(others.length > 0
          ? [{ label: "Other", members: others }]
          : []),
      ],
      members: [],
    };
  }

  if (profile.profile_type === "family") {
    const people = [
      ...familyMembersOf(profiles, profile.id),
      ...studentsOf(profiles, profile.id),
      ...petsOf(profiles, profile.id),
    ];
    const things = [
      ...homesOf(profiles, profile.id),
      ...vehiclesOf(profiles, profile.id),
      ...hobbiesOf(profiles, profile.id),
    ];
    const others = otherSpacesOf(profiles, profile.id);
    return {
      profile,
      groups: [
        { label: "Family members", members: people },
        { label: "Things", members: things },
        ...(others.length > 0
          ? [{ label: "Other", members: others }]
          : []),
      ],
      members: [],
    };
  }

  return {
    profile,
    groups: [],
    members: nestedUnder(profiles, profile),
  };
}

/** Account-rooted tree: You → Family / Business / … as sibling branches. */
export function buildVaultMapTree(
  profiles: GuardianProfile[],
  ownerLabel: string
): VaultMapTree | null {
  const tops = topLevelProfiles(profiles);
  const personalProfile =
    tops.find((p) => p.profile_type === "personal") ?? null;
  const branches = tops
    .filter((p) => p.profile_type !== "personal")
    .sort((a, b) => {
      const rank = branchRank(a.profile_type) - branchRank(b.profile_type);
      if (rank !== 0) return rank;
      return a.display_name.localeCompare(b.display_name);
    })
    .map((p) => branchForProfile(profiles, p));

  if (branches.length === 0 && !personalProfile) return null;

  const label = ownerLabel.trim();
  return {
    ownerLabel: label || "You",
    personalProfile,
    branches,
  };
}

/** @deprecated Use buildVaultMapTree */
export type VaultMapRoot = {
  profile: GuardianProfile;
  children: GuardianProfile[];
};

/** @deprecated Use buildVaultMapTree */
export function buildVaultMapRoots(profiles: GuardianProfile[]): VaultMapRoot[] {
  return topLevelProfiles(profiles).map((profile) => ({
    profile,
    children: nestedUnder(profiles, profile),
  }));
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function profileMapLine(
  profile: GuardianProfile,
  activeProfileId: string | null | undefined,
  depth: number
): string {
  const type = profileTypeLabel(profile.profile_type);
  const active =
    activeProfileId && profile.id === activeProfileId ? " ← active vault" : "";
  return `${indent(depth)}- ${profile.display_name} (${type})${active}`;
}

function formatMemberGroup(
  group: VaultMapMemberGroup,
  activeProfileId: string | null | undefined,
  depth: number
): string[] {
  if (group.members.length === 0) return [];
  const lines = [`${indent(depth)}${group.label}:`];
  for (const member of group.members) {
    lines.push(profileMapLine(member, activeProfileId, depth + 1));
  }
  return lines;
}

function formatBranchLines(
  branch: VaultMapBranch,
  activeProfileId: string | null | undefined,
  depth: number
): string[] {
  const lines = [profileMapLine(branch.profile, activeProfileId, depth)];
  for (const group of branch.groups) {
    lines.push(...formatMemberGroup(group, activeProfileId, depth + 1));
  }
  if (branch.members.length > 0) {
    for (const member of branch.members) {
      lines.push(profileMapLine(member, activeProfileId, depth + 1));
    }
  }
  return lines;
}

/** Breadcrumb path from account root to a profile (for leaf vaults). */
export function vaultMapPathToProfile(
  profiles: GuardianProfile[],
  ownerLabel: string,
  profileId: string
): string | null {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const target = byId.get(profileId);
  if (!target) return null;

  const names: string[] = [target.display_name];
  let parentId = target.parent_profile_id;
  const seen = new Set<string>([profileId]);

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.display_name);
    parentId = parent.parent_profile_id;
  }

  const root = ownerLabel.trim() || "You";
  if (names[0] !== root && !byId.has(names[0] ?? "")) {
    names.unshift(root);
  }

  return names.join(" → ");
}

/**
 * Text vault map for Gideon — mirrors Settings → Profiles vault map.
 * Marks the active vault and includes a breadcrumb when chatting from a leaf vault.
 */
export function formatVaultMapForGideon(
  profiles: GuardianProfile[],
  ownerLabel: string,
  activeProfileId?: string | null
): string {
  const tree = buildVaultMapTree(profiles, ownerLabel);
  if (!tree) {
    return "(no vault structure — create a person or space in Guardian first)";
  }

  const lines: string[] = [
    "This is Guardian's vault hierarchy (same structure as Settings → Vault map).",
    `Account root: ${tree.ownerLabel}`,
  ];

  if (activeProfileId) {
    const path = vaultMapPathToProfile(profiles, tree.ownerLabel, activeProfileId);
    if (path) {
      lines.push(`Active vault path: ${path}`);
    }
  }

  lines.push("", "Tree:");

  if (tree.personalProfile) {
    lines.push(profileMapLine(tree.personalProfile, activeProfileId, 0));
  }

  for (const branch of tree.branches) {
    lines.push(...formatBranchLines(branch, activeProfileId, 0));
  }

  return lines.join("\n");
}
