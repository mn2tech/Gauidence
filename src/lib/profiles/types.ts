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
    profile.profile_type === "business" ||
    profile.profile_type === "non_profit"
  ) {
    return `${name} Vault`;
  }
  if (name.toLowerCase().endsWith("s")) return `${name}' Vault`;
  return `${name}'s Vault`;
}

export function askGideonContextLabel(profile: GuardianProfile): string {
  const name = profile.display_name.trim() || "this profile";
  if (
    profile.profile_type === "business" ||
    profile.profile_type === "non_profit"
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
