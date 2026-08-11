export function normalizeSsnInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  if (digits === "000000000" || digits.startsWith("000")) return null;
  return digits;
}

export function formatSsnDisplay(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function ssnLastFour(digits: string): string {
  return digits.slice(-4);
}
