import {
  clientsOf,
  employeesOf,
  isOrgStyleProfile,
  nestedUnder,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";

/** Labeled roster under an org-style vault (e.g. Employees, Clients). */
export type VaultMapMemberGroup = {
  label: string;
  members: GuardianProfile[];
};

/** One top-level space under the account owner. */
export type VaultMapBranch = {
  profile: GuardianProfile;
  /** Org-style vaults: Employees / Clients columns. */
  groups: VaultMapMemberGroup[];
  /** Family, vehicles, and other containers: flat linked members. */
  members: GuardianProfile[];
};

/** Full account tree for the vault map. */
export type VaultMapTree = {
  ownerLabel: string;
  /** Personal vault when the user has a top-level "personal" space. */
  personalProfile: GuardianProfile | null;
  branches: VaultMapBranch[];
};

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

  return {
    profile,
    groups: [],
    members: nestedUnder(profiles, profile),
  };
}

/** Account-rooted tree: You → Family / Business / … with grouped org rosters. */
export function buildVaultMapTree(
  profiles: GuardianProfile[],
  ownerLabel: string
): VaultMapTree | null {
  const tops = topLevelProfiles(profiles);
  const personalProfile =
    tops.find((p) => p.profile_type === "personal") ?? null;
  const branches = tops
    .filter((p) => p.profile_type !== "personal")
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
