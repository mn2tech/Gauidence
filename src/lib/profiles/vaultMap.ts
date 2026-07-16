import {
  clientsOf,
  employeesOf,
  familyMembersOf,
  homesOf,
  isOrgStyleProfile,
  nestedUnder,
  petsOf,
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
    return {
      profile,
      groups: [
        { label: "Employees", members: employeesOf(profiles, profile.id) },
        { label: "Clients", members: clientsOf(profiles, profile.id) },
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
    ];
    return {
      profile,
      groups: [
        { label: "Family members", members: people },
        { label: "Things", members: things },
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
