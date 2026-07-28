export type CollaboratorAccount = {
  email: string | null;
  fullName: string | null;
};

/** Primary label for a vault member on the Manage access screen. */
export function collaboratorDisplayName(
  account: CollaboratorAccount | null | undefined
): string {
  const name = account?.fullName?.trim();
  if (name) return name;
  const email = account?.email?.trim();
  if (email) return email;
  return "Editor";
}
