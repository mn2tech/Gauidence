import { EMPLOYEE_HUB_PATH } from "@/lib/employee-hub/routing";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

/** Full vault workspace (sections for files, logs, linked people, etc.). */
export const DOCUMENTS_PATH = "/dashboard?docs=1";
export const REQUESTS_PATH = "/requests";
export const PROPOSALS_PATH = "/proposals";
export const LEADS_PATH = "/leads";
export const BUSINESS_ADVISOR_PATH = "/business-advisor";

/** Header / nav label for {@link DOCUMENTS_PATH}. */
export const VAULT_NAV_LABEL = "Spaces";

/** Primary ingestion flow — upload, paste, or capture anything. */
export const ADD_ANYTHING_PATH = "/add";

/** Daily memory capture — "Remember Today". */
export const REMEMBER_TODAY_PATH = "/remember";

export function documentsHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  return `${DOCUMENTS_PATH}#documents-${profileId}`;
}

/** Dashboard URL after switching spaces — always points at the new space. */
export function vaultSwitchHref(
  profileId: string,
  searchParams: URLSearchParams
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("profileId", profileId);
  if (!params.has("docs")) params.set("docs", "1");
  return `/dashboard?${params.toString()}#documents-${profileId}`;
}

export function dailyLogHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  const q = new URLSearchParams({ docs: "1", profileId });
  return `/dashboard?${q.toString()}#daily-log-${profileId}`;
}

export function conversationHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  const q = new URLSearchParams({ docs: "1", profileId });
  return `/dashboard?${q.toString()}#conversation-${profileId}`;
}

export function decisionsHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  const q = new URLSearchParams({ docs: "1", profileId });
  return `/dashboard?${q.toString()}#decisions-${profileId}`;
}

export function hasDocumentsIntent(
  params: Record<string, string | string[] | undefined>
): boolean {
  return (
    params.docs !== undefined ||
    params.camera !== undefined ||
    params.documentId !== undefined ||
    params.logId !== undefined ||
    params.profileId !== undefined ||
    params.searchTerm !== undefined ||
    params.passwordUpdated !== undefined
  );
}

/** Where to send someone after they accept a vault invitation. */
export function inviteAcceptLandingPath(args: {
  profileId: string;
  profileType: string;
  parentProfileId?: string | null;
  role: string;
  simpleHome?: boolean;
}): string {
  if (args.profileType === "employee" && args.parentProfileId) {
    return EMPLOYEE_HUB_PATH;
  }
  if (args.profileType === "client" && args.role === "viewer") {
    return args.simpleHome ? SIMPLE_HOME_PATH : documentsHref(args.profileId);
  }
  if (args.simpleHome) return SIMPLE_HOME_PATH;
  return documentsHref(args.profileId);
}
