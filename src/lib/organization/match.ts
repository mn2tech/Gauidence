import type { GuardianProfile } from "@/lib/profiles/types";
import {
  canHaveLinkedOtherSpaces,
  familyMembersOf,
  isOrgStyleProfile,
  otherSpacesOf,
  studentsOf,
} from "@/lib/profiles/types";
import { bestNameMatch, nameMatchScore, namesMatch } from "./normalize";
import type { OrganizationAiOutput, OrganizationMatchResult } from "./types";

const LOW_CONFIDENCE_THRESHOLD = 0.45;

function childrenOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter((p) => p.parent_profile_id === parentId);
}

function personCandidates(
  profiles: GuardianProfile[],
  ai: OrganizationAiOutput
): GuardianProfile[] {
  const names = [
    ai.suggested_profile_name,
    ...ai.people,
  ].filter(Boolean);
  const out: GuardianProfile[] = [];
  for (const profile of profiles) {
    if (names.some((n) => namesMatch(profile.display_name, n))) {
      out.push(profile);
    }
  }
  return out;
}

function familyContainerFor(
  profiles: GuardianProfile[],
  person: GuardianProfile | null
): GuardianProfile | null {
  if (!person?.parent_profile_id) return null;
  return (
    profiles.find((p) => p.id === person.parent_profile_id) ?? null
  );
}

function topicalVaultCandidates(
  profiles: GuardianProfile[],
  person: GuardianProfile | null
): GuardianProfile[] {
  const out: GuardianProfile[] = [];
  if (person) {
    const family = familyContainerFor(profiles, person);
    if (family && canHaveLinkedOtherSpaces(family.profile_type)) {
      out.push(...otherSpacesOf(profiles, family.id));
    }
    if (person.profile_type === "personal") {
      out.push(...otherSpacesOf(profiles, person.id));
    }
  }
  for (const p of profiles) {
    if (p.profile_type === "personal" || p.profile_type === "other") {
      out.push(p);
    }
    if (isOrgStyleProfile(p.profile_type)) {
      out.push(...otherSpacesOf(profiles, p.id));
    }
    if (p.profile_type === "family") {
      out.push(
        ...otherSpacesOf(profiles, p.id),
        ...familyMembersOf(profiles, p.id),
        ...studentsOf(profiles, p.id)
      );
    }
  }
  return [...new Map(out.map((p) => [p.id, p])).values()];
}

function findVaultProfile(
  profiles: GuardianProfile[],
  vaultName: string,
  person: GuardianProfile | null,
  currentProfileId: string | null
): GuardianProfile | null {
  if (!vaultName.trim()) return null;

  if (currentProfileId) {
    const current = profiles.find((p) => p.id === currentProfileId);
    if (current && namesMatch(current.display_name, vaultName)) {
      return current;
    }
    const underCurrent = bestNameMatch(
      childrenOf(profiles, currentProfileId),
      vaultName
    );
    if (underCurrent) return underCurrent;
  }

  if (person && namesMatch(person.display_name, vaultName)) {
    return person;
  }

  const topical = topicalVaultCandidates(profiles, person);
  const topicalMatch = bestNameMatch(topical, vaultName);
  if (topicalMatch) return topicalMatch;

  return bestNameMatch(profiles, vaultName);
}

function inferCreateContainer(
  profiles: GuardianProfile[],
  person: GuardianProfile | null
): GuardianProfile | null {
  if (person) {
    const family = familyContainerFor(profiles, person);
    if (family && canHaveLinkedOtherSpaces(family.profile_type)) {
      return family;
    }
    if (person.profile_type === "personal") return person;
    if (canHaveLinkedOtherSpaces(person.profile_type)) return person;
  }
  return (
    profiles.find((p) => p.profile_type === "family") ??
    profiles.find((p) => p.profile_type === "personal") ??
    null
  );
}

/**
 * Match AI organization output against authorized profiles/vaults.
 * In Guardian, vault = guardian_profile (documents.profile_id).
 */
export function matchOrganizationTarget(
  profiles: GuardianProfile[],
  ai: OrganizationAiOutput,
  currentProfileId: string | null
): OrganizationMatchResult {
  const confidence = Math.max(0, Math.min(1, ai.confidence));
  const profileName = ai.suggested_profile_name.trim() || ai.people[0]?.trim() || "";
  const vaultName =
    ai.suggested_vault_name.trim() || profileName || ai.topics[0]?.trim() || "";

  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      recommendedAction: "unorganized",
      suggestedProfileId: null,
      suggestedProfileName: profileName,
      suggestedVaultId: null,
      suggestedVaultName: vaultName,
      confidence,
      reason:
        ai.reason ||
        "Guardian isn't confident enough to suggest a location for this document.",
      containerProfileId: null,
    };
  }

  const people = personCandidates(profiles, ai);
  const person =
    bestNameMatch(people, profileName) ??
    (people.length === 1 ? people[0] : null);

  const vault = findVaultProfile(profiles, vaultName, person, currentProfileId);

  if (vault) {
    const personForDisplay = person ?? vault;
    return {
      recommendedAction: "save_to_existing",
      suggestedProfileId: personForDisplay?.id ?? vault.id,
      suggestedProfileName: personForDisplay?.display_name ?? profileName,
      suggestedVaultId: vault.id,
      suggestedVaultName: vault.display_name,
      confidence,
      reason: ai.reason,
      containerProfileId: vault.parent_profile_id,
    };
  }

  if (person) {
    const container = inferCreateContainer(profiles, person);
    return {
      recommendedAction: "create_vault",
      suggestedProfileId: person.id,
      suggestedProfileName: person.display_name,
      suggestedVaultId: null,
      suggestedVaultName: vaultName,
      confidence,
      reason: ai.reason,
      containerProfileId: container?.id ?? null,
    };
  }

  if (profileName) {
    const container =
      profiles.find((p) => p.profile_type === "family") ??
      profiles.find((p) => p.profile_type === "personal") ??
      null;
    return {
      recommendedAction: "create_profile_and_vault",
      suggestedProfileId: null,
      suggestedProfileName: profileName,
      suggestedVaultId: null,
      suggestedVaultName: vaultName || profileName,
      confidence,
      reason: ai.reason,
      containerProfileId: container?.id ?? null,
    };
  }

  if (currentProfileId) {
    const current = profiles.find((p) => p.id === currentProfileId);
    return {
      recommendedAction: "keep_current",
      suggestedProfileId: current?.id ?? null,
      suggestedProfileName: current?.display_name ?? "",
      suggestedVaultId: current?.id ?? null,
      suggestedVaultName: current?.display_name ?? "",
      confidence,
      reason: ai.reason || "Keep this document in the current vault.",
      containerProfileId: current?.parent_profile_id ?? null,
    };
  }

  return {
    recommendedAction: "unorganized",
    suggestedProfileId: null,
    suggestedProfileName: profileName,
    suggestedVaultId: null,
    suggestedVaultName: vaultName,
    confidence,
    reason: ai.reason,
    containerProfileId: null,
  };
}

/** Prefer existing vault in active profile when score is high. */
export function boostActiveProfileMatch(
  profiles: GuardianProfile[],
  match: OrganizationMatchResult,
  currentProfileId: string | null,
  ai: OrganizationAiOutput
): OrganizationMatchResult {
  if (!currentProfileId || match.recommendedAction !== "save_to_existing") {
    return match;
  }
  const current = profiles.find((p) => p.id === currentProfileId);
  if (!current) return match;
  const vaultScore = nameMatchScore(
    current.display_name,
    ai.suggested_vault_name || ai.suggested_profile_name
  );
  if (vaultScore >= 0.7) {
    return {
      ...match,
      suggestedVaultId: current.id,
      suggestedVaultName: current.display_name,
      suggestedProfileId: current.id,
      suggestedProfileName: current.display_name,
      reason: `${match.reason} (matched your current vault.)`,
    };
  }
  return match;
}
