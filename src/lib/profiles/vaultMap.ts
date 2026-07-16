import {
  nestedUnder,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";

/** One root vault and its linked members for the map view. */
export type VaultMapRoot = {
  profile: GuardianProfile;
  children: GuardianProfile[];
};

/** Top-level profiles with nested members (containers and standalones). */
export function buildVaultMapRoots(profiles: GuardianProfile[]): VaultMapRoot[] {
  return topLevelProfiles(profiles).map((profile) => ({
    profile,
    children: nestedUnder(profiles, profile),
  }));
}
