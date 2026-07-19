/**
 * Platform admins (comma-separated emails in ADMIN_EMAILS).
 * Empty / unset → nobody is admin (safe default).
 */
export function isPlatformAdmin(
  email: string | null | undefined
): boolean {
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  if (!raw || !email?.trim()) return false;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return allowed.has(email.trim().toLowerCase());
}
