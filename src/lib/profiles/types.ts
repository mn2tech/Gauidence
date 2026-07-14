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
  "business",
  "non_profit",
  "employee",
  "client",
  "vehicle",
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
  business: "Business",
  non_profit: "Nonprofit",
  employee: "Employee",
  client: "Client",
  vehicle: "Vehicle",
  home: "Home",
  pet: "Pet",
  other: "Other",
};

/** Creation wizard step-1 options → profile_type */
export const PROFILE_CREATE_OPTIONS: {
  id: string;
  label: string;
  profileType: GuardianProfileType;
  relationship?: string;
}[] = [
  { id: "myself", label: "Myself", profileType: "personal", relationship: "Myself" },
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
  { id: "vehicle", label: "A vehicle", profileType: "vehicle" },
  { id: "home", label: "A home", profileType: "home" },
  { id: "pet", label: "A pet", profileType: "pet" },
  { id: "other", label: "Something else", profileType: "other" },
];

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
    isOrgStyleProfile(profile.profile_type) ||
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
    isOrgStyleProfile(profile.profile_type) ||
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

/** Vehicle, home, pet — named assets, not people. */
export function isAssetStyleProfile(type: GuardianProfileType): boolean {
  return type === "vehicle" || type === "home" || type === "pet";
}

/** Business / nonprofit can own linked employee and client profiles. */
export function canHaveLinkedEmployees(type: GuardianProfileType): boolean {
  return isOrgStyleProfile(type);
}

export function canHaveLinkedClients(type: GuardianProfileType): boolean {
  return isOrgStyleProfile(type);
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

/** Employee/client vault linked under a business or nonprofit. */
export function isLinkedOrgMember(profile: {
  profile_type: GuardianProfileType;
  parent_profile_id?: string | null;
}): boolean {
  return (
    Boolean(profile.parent_profile_id) &&
    (profile.profile_type === "employee" || profile.profile_type === "client")
  );
}

/** Profiles shown at the root of switchers / manage list (not nested members). */
export function topLevelProfiles(
  profiles: GuardianProfile[]
): GuardianProfile[] {
  return profiles.filter((p) => !isLinkedOrgMember(p));
}

export type LinkedPersonSummary = {
  display_name: string;
  job_title: string | null;
  department: string | null;
  description?: string | null;
};

/** @deprecated Use LinkedPersonSummary */
export type LinkedEmployeeSummary = LinkedPersonSummary;

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
