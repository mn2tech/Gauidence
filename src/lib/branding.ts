export const GUARDIAN_LOGO_SRC = "/branding/guardian-logo.png";
export const GUARDIAN_ICON_SRC = "/branding/guardian-icon.png";
export const GUARDIAN_WORDMARK_SRC = "/branding/guardian-wordmark.png";

/** Visual brand line — not used in compact navigation. */
export const GUARDIAN_BRAND_TAGLINE =
  "YOUR LIFE. YOUR KNOWLEDGE. YOUR LEGACY.";

export type GuardianBrandTone = "light" | "dark" | "auto";

export function guardianBrandToneClass(tone: GuardianBrandTone): string {
  if (tone === "dark") return "invert";
  if (tone === "auto") return "brightness-0 dark:invert";
  return "brightness-0";
}

export function guardianEmailLockupHtml(baseUrl: string, width = 168): string {
  const origin = baseUrl.replace(/\/$/, "");
  const src = `${origin}${GUARDIAN_LOGO_SRC}`;
  return `<img src="${src}" alt="Guardian" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;" />`;
}
