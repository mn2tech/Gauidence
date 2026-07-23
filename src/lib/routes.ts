/** Opens the Documents vault (not the post-login default). */
export const DOCUMENTS_PATH = "/dashboard?docs=1";

export function documentsHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  return `${DOCUMENTS_PATH}#documents-${profileId}`;
}

export function dailyLogHref(profileId?: string | null): string {
  if (!profileId) return DOCUMENTS_PATH;
  return `${DOCUMENTS_PATH}#daily-log-${profileId}`;
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
