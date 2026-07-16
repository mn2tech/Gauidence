/**
 * Guardian multi-profile types (vault contexts under one account).
 */

export const GUARDIAN_PROFILE_TYPES = [
  "personal",
  "child",
  "spouse_partner",
  "parent",
  "family_member",
  "student",
  "family",
  "business",
  "non_profit",
  "employee",
  "client",
  "vehicle",
  "vehicles",
  "home",
  "pet",
  "other",
] as const;

export type GuardianProfileType = (typeof GUARDIAN_PROFILE_TYPES)[number];

export const PROFILE_TYPE_LABELS: Record<GuardianProfileType, string> = {
  personal: "Personal",
  child: "Child",
  spouse_partner: "Spouse or partner",
  parent: "Parent",
  family_member: "Family member",
  student: "Student",
  family: "Family",
  business: "Business",
  non_profit: "Nonprofit",
  employee: "Employee",
  client: "Client",
  vehicle: "Vehicle",
  vehicles: "Vehicles",
  home: "Home",
  pet: "Pet",
  other: "Other",
};

/** Leaf types that nest under a Family container. */
export const FAMILY_MEMBER_TYPES = [
  "child",
  "spouse_partner",
  "parent",
  "family_member",
  "student",
] as const;

export type FamilyMemberType = (typeof FAMILY_MEMBER_TYPES)[number];

/** Family people excluding students (students have their own section). */
export const FAMILY_PEOPLE_TYPES = [
  "child",
  "spouse_partner",
  "parent",
  "family_member",
] as const;

/** Creation wizard step-1 options → profile_type */
export const PROFILE_CREATE_OPTIONS: {
  id: string;
  label: string;
  profileType: GuardianProfileType;
  relationship?: string;
}[] = [
  { id: "myself", label: "Myself", profileType: "personal", relationship: "Myself" },
  { id: "my_family", label: "My family", profileType: "family" },
  { id: "child", label: "My child", profileType: "child", relationship: "Child" },
  {
    id: "spouse",
    label: "My spouse or partner",
    profileType: "spouse_partner",
    relationship: "Spouse or partner",
  },
  { id: "parent", label: "My parent", profileType: "parent", relationship: "Parent" },
  {
    id: "family",
    label: "Another family member",
    profileType: "family_member",
    relationship: "Family member",
  },
  { id: "student", label: "A student", profileType: "student", relationship: "Student" },
  { id: "business", label: "My business", profileType: "business" },
  { id: "nonprofit", label: "A nonprofit", profileType: "non_profit" },
  { id: "employee", label: "An employee", profileType: "employee" },
  { id: "client", label: "A client", profileType: "client" },
  { id: "my_vehicles", label: "My vehicles", profileType: "vehicles" },
  { id: "vehicle", label: "A vehicle", profileType: "vehicle" },
  { id: "home", label: "A home / house", profileType: "home" },
  { id: "pet", label: "A pet", profileType: "pet" },
  { id: "other", label: "Something else", profileType: "other" },
];

export type ProfileCreateGroupId = "family" | "business" | "student" | "other";

/** Guided create buckets: Family / Business / Student / Other. */
export const PROFILE_CREATE_GROUPS: {
  id: ProfileCreateGroupId;
  label: string;
  description: string;
  /** PROFILE_CREATE_OPTIONS ids shown under this bucket. */
  optionIds: string[];
}[] = [
  {
    id: "family",
    label: "Family",
    description: "A family group, or people and pets in it",
    optionIds: [
      "my_family",
      "child",
      "spouse",
      "parent",
      "family",
      "pet",
      "home",
      "vehicle",
    ],
  },
  {
    id: "business",
    label: "Business",
    description: "A company or nonprofit, plus employees and clients",
    optionIds: [
      "business",
      "nonprofit",
      "employee",
      "client",
      "home",
      "vehicle",
    ],
  },
  {
    id: "student",
    label: "Student",
    description: "School records, grades, and student vaults",
    optionIds: ["student"],
  },
  {
    id: "other",
    label: "Other",
    description: "Yourself, a garage, or something that doesn’t fit above",
    optionIds: ["myself", "my_vehicles", "vehicle", "home", "other"],
  },
];

export function optionsForCreateGroup(groupId: ProfileCreateGroupId) {
  const group = PROFILE_CREATE_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.optionIds
    .map((id) => PROFILE_CREATE_OPTIONS.find((o) => o.id === id))
    .filter((o): o is (typeof PROFILE_CREATE_OPTIONS)[number] => Boolean(o));
}

export type GuardianProfile = {
  id: string;
  owner_user_id: string;
  profile_type: GuardianProfileType;
  display_name: string;
  relationship: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  school_name: string | null;
  grade_level: string | null;
  business_legal_name: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  job_title: string | null;
  department: string | null;
  organization_name: string | null;
  parent_profile_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function isGuardianProfileType(v: unknown): v is GuardianProfileType {
  return (
    typeof v === "string" &&
    (GUARDIAN_PROFILE_TYPES as readonly string[]).includes(v)
  );
}

export function isFamilyMemberType(v: unknown): v is FamilyMemberType {
  return (
    typeof v === "string" &&
    (FAMILY_MEMBER_TYPES as readonly string[]).includes(v)
  );
}

export function profileTypeLabel(type: GuardianProfileType): string {
  return PROFILE_TYPE_LABELS[type];
}

/** Type · relationship, omitting relationship when it duplicates the type. */
export function profileSubtitle(profile: {
  profile_type: GuardianProfileType;
  relationship?: string | null;
}): string {
  const type = profileTypeLabel(profile.profile_type);
  const rel = profile.relationship?.trim();
  if (!rel) return type;
  if (rel.toLowerCase() === type.toLowerCase()) return type;
  return `${type} · ${rel}`;
}

/** Company/org name used for invoice payment-direction matching. */
export function profileCompanyContext(profile: GuardianProfile): string | null {
  if (profile.profile_type === "business" || profile.profile_type === "non_profit") {
    return (
      profile.business_legal_name?.trim() ||
      profile.display_name?.trim() ||
      null
    );
  }
  return (
    profile.organization_name?.trim() ||
    profile.business_legal_name?.trim() ||
    null
  );
}

export function vaultLabel(profile: GuardianProfile): string {
  const name = profile.display_name.trim() || "Profile";
  if (
    isGroupStyleProfile(profile.profile_type) ||
    isAssetStyleProfile(profile.profile_type)
  ) {
    return `${name} Vault`;
  }
  if (name.toLowerCase().endsWith("s")) return `${name}' Vault`;
  return `${name}'s Vault`;
}

export function askGideonContextLabel(profile: GuardianProfile): string {
  const name = profile.display_name.trim() || "this profile";
  if (
    isGroupStyleProfile(profile.profile_type) ||
    isAssetStyleProfile(profile.profile_type)
  ) {
    return `Ask Gideon about ${name}`;
  }
  if (name.toLowerCase().endsWith("s")) {
    return `Ask Gideon about ${name}' vault`;
  }
  return `Ask Gideon about ${name}'s vault`;
}

export function isOrgStyleProfile(type: GuardianProfileType): boolean {
  return type === "business" || type === "non_profit";
}

/** Family / Vehicles / Business / Nonprofit — container vaults with linked children. */
export function isGroupStyleProfile(type: GuardianProfileType): boolean {
  return (
    isOrgStyleProfile(type) || type === "family" || type === "vehicles"
  );
}

/** Vehicle, home, pet — named assets, not people. */
export function isAssetStyleProfile(type: GuardianProfileType): boolean {
  return type === "vehicle" || type === "home" || type === "pet";
}

/** Label for avatar upload UI — logo for orgs, photo for people/assets. */
export function profileAvatarLabel(type: GuardianProfileType): string {
  if (isOrgStyleProfile(type)) return "Logo";
  return "Photo";
}

/** Business / nonprofit can own linked employee and client profiles. */
export function canHaveLinkedEmployees(type: GuardianProfileType): boolean {
  return isOrgStyleProfile(type);
}

export function canHaveLinkedClients(type: GuardianProfileType): boolean {
  return isOrgStyleProfile(type);
}

export function canHaveLinkedFamilyMembers(type: GuardianProfileType): boolean {
  return type === "family";
}

/** Students nest under Family (shown as their own section). */
export function canHaveLinkedStudents(type: GuardianProfileType): boolean {
  return type === "family";
}

/** Pets nest under Family. */
export function canHaveLinkedPets(type: GuardianProfileType): boolean {
  return type === "family";
}

/** Vehicles nest under Family, Business, Nonprofit, or a Vehicles garage. */
export function canHaveLinkedVehicles(type: GuardianProfileType): boolean {
  return (
    type === "vehicles" || type === "family" || isOrgStyleProfile(type)
  );
}

/** Family / business / nonprofit can own linked home (house) profiles. */
export function canHaveLinkedHomes(type: GuardianProfileType): boolean {
  return type === "family" || isOrgStyleProfile(type);
}

/** Family / business / nonprofit can own misc "other" spaces (e.g. Celebrations). */
export function canHaveLinkedOtherSpaces(type: GuardianProfileType): boolean {
  return type === "family" || isOrgStyleProfile(type);
}

/** Profile types that can nest under a container (not the containers themselves). */
export function isNestableProfileType(type: GuardianProfileType): boolean {
  return (
    type === "employee" ||
    type === "client" ||
    type === "vehicle" ||
    type === "home" ||
    type === "pet" ||
    type === "other" ||
    isFamilyMemberType(type)
  );
}

/** Whether a child profile type may be linked under a parent container type. */
export function canAttachChildToParent(
  childType: GuardianProfileType,
  parentType: GuardianProfileType
): boolean {
  if (childType === "home") return canHaveLinkedHomes(parentType);
  if (childType === "vehicle") return canHaveLinkedVehicles(parentType);
  if (childType === "pet") return canHaveLinkedPets(parentType);
  if (isFamilyMemberType(childType)) {
    return canHaveLinkedFamilyMembers(parentType);
  }
  if (childType === "employee") return canHaveLinkedEmployees(parentType);
  if (childType === "client") return canHaveLinkedClients(parentType);
  if (childType === "other") return canHaveLinkedOtherSpaces(parentType);
  return false;
}

/** Unlinked nestable profiles eligible to attach under a given container. */
export function unlinkedAttachableTo(
  profiles: GuardianProfile[],
  parent: GuardianProfile
): GuardianProfile[] {
  return profiles.filter(
    (p) =>
      !p.parent_profile_id &&
      p.id !== parent.id &&
      canAttachChildToParent(p.profile_type, parent.profile_type)
  );
}

/** Unlinked profiles of specific types that can attach under a container. */
export function unlinkedOfTypes(
  profiles: GuardianProfile[],
  parent: GuardianProfile,
  types: readonly GuardianProfileType[]
): GuardianProfile[] {
  const allowed = new Set(types);
  return unlinkedAttachableTo(profiles, parent).filter((p) =>
    allowed.has(p.profile_type)
  );
}

export function employeesOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "employee"
  );
}

export function clientsOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "client"
  );
}

export function familyMembersOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) =>
      p.parent_profile_id === parentId &&
      isFamilyMemberType(p.profile_type) &&
      p.profile_type !== "student"
  );
}

export function studentsOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "student"
  );
}

export function petsOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "pet"
  );
}

export function vehiclesOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "vehicle"
  );
}

export function homesOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "home"
  );
}

export function otherSpacesOf(
  profiles: GuardianProfile[],
  parentId: string
): GuardianProfile[] {
  return profiles.filter(
    (p) => p.parent_profile_id === parentId && p.profile_type === "other"
  );
}

/** Nested people/places under a container for switchers and welcome strip. */
export function nestedUnder(
  profiles: GuardianProfile[],
  parent: GuardianProfile
): GuardianProfile[] {
  const out: GuardianProfile[] = [];
  if (canHaveLinkedEmployees(parent.profile_type)) {
    out.push(...employeesOf(profiles, parent.id));
  }
  if (canHaveLinkedClients(parent.profile_type)) {
    out.push(...clientsOf(profiles, parent.id));
  }
  if (canHaveLinkedFamilyMembers(parent.profile_type)) {
    out.push(...familyMembersOf(profiles, parent.id));
  }
  if (canHaveLinkedStudents(parent.profile_type)) {
    out.push(...studentsOf(profiles, parent.id));
  }
  if (canHaveLinkedPets(parent.profile_type)) {
    out.push(...petsOf(profiles, parent.id));
  }
  if (canHaveLinkedHomes(parent.profile_type)) {
    out.push(...homesOf(profiles, parent.id));
  }
  if (canHaveLinkedVehicles(parent.profile_type)) {
    out.push(...vehiclesOf(profiles, parent.id));
  }
  if (canHaveLinkedOtherSpaces(parent.profile_type)) {
    out.push(...otherSpacesOf(profiles, parent.id));
  }
  return out;
}

/** Any nested vault under a container (org, family, or vehicles). */
export function isLinkedMemberProfile(profile: {
  profile_type: GuardianProfileType;
  parent_profile_id?: string | null;
}): boolean {
  if (!profile.parent_profile_id) return false;
  return isNestableProfileType(profile.profile_type);
}

/** @deprecated Use isLinkedMemberProfile */
export function isLinkedOrgMember(profile: {
  profile_type: GuardianProfileType;
  parent_profile_id?: string | null;
}): boolean {
  return isLinkedMemberProfile(profile);
}

/** Profiles shown at the root of switchers / manage list (not nested members). */
export function topLevelProfiles(
  profiles: GuardianProfile[]
): GuardianProfile[] {
  return profiles.filter((p) => !isLinkedMemberProfile(p));
}

export type LinkedPersonSummary = {
  display_name: string;
  job_title: string | null;
  department: string | null;
  description?: string | null;
};

/** @deprecated Use LinkedPersonSummary */
export type LinkedEmployeeSummary = LinkedPersonSummary;

export type LinkedFamilyMemberSummary = {
  display_name: string;
  profile_type: GuardianProfileType;
  relationship: string | null;
};

export type LinkedVehicleSummary = {
  display_name: string;
  description?: string | null;
};

/** Context block for Gideon: linked employee roster under an org profile. */
export function formatLinkedEmployeesForGideon(
  orgName: string,
  employees: LinkedPersonSummary[]
): string {
  const count = employees.length;
  const header = `Organization profile: ${orgName}\nLinked employee profiles in Guardian: ${count}`;
  if (count === 0) {
    return `${header}\n(None linked yet. This is Guardian's linked-profile count — not a payroll or legal headcount from documents.)`;
  }
  const lines = employees.map((e, i) => {
    const bits = [e.job_title, e.department].filter(Boolean);
    return `${i + 1}. ${e.display_name}${bits.length ? ` — ${bits.join(", ")}` : ""}`;
  });
  return `${header}\n${lines.join("\n")}\n(This is Guardian's linked-profile roster — not payroll headcount unless documents also support it.)`;
}

/** Context block for Gideon: linked client roster under an org profile. */
export function formatLinkedClientsForGideon(
  orgName: string,
  clients: LinkedPersonSummary[]
): string {
  const count = clients.length;
  const header = `Organization profile: ${orgName}\nLinked client profiles in Guardian: ${count}`;
  if (count === 0) {
    return `${header}\n(None linked yet.)`;
  }
  const lines = clients.map((c, i) => {
    const note = c.description?.trim() || c.job_title?.trim();
    return `${i + 1}. ${c.display_name}${note ? ` — ${note}` : ""}`;
  });
  return `${header}\n${lines.join("\n")}\n(This is Guardian's linked client roster under this organization.)`;
}

export function formatLinkedFamilyForGideon(
  familyName: string,
  members: LinkedFamilyMemberSummary[]
): string {
  const count = members.length;
  const header = `Family profile: ${familyName}\nLinked family member profiles in Guardian: ${count}`;
  if (count === 0) {
    return `${header}\n(None linked yet.)`;
  }
  const lines = members.map((m, i) => {
    const role = m.relationship?.trim() || profileTypeLabel(m.profile_type);
    return `${i + 1}. ${m.display_name} — ${role}`;
  });
  return `${header}\n${lines.join("\n")}`;
}

export function formatLinkedVehiclesForGideon(
  groupName: string,
  vehicles: LinkedVehicleSummary[]
): string {
  const count = vehicles.length;
  const header = `Vehicles profile: ${groupName}\nLinked vehicle profiles in Guardian: ${count}`;
  if (count === 0) {
    return `${header}\n(None linked yet.)`;
  }
  const lines = vehicles.map((v, i) => {
    const note = v.description?.trim();
    return `${i + 1}. ${v.display_name}${note ? ` — ${note}` : ""}`;
  });
  return `${header}\n${lines.join("\n")}`;
}
