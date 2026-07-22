/** Normalize US/international numbers to E.164 (+1XXXXXXXXXX). */

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function isValidPhoneE164(value: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(value);
}
