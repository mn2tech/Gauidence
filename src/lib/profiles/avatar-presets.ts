/** Built-in avatar options — no upload required. */

export type AvatarPreset = {
  id: string;
  label: string;
  /** Public path served from /public/avatars */
  src: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "teal", label: "Teal", src: "/avatars/teal.svg" },
  { id: "sky", label: "Sky", src: "/avatars/sky.svg" },
  { id: "amber", label: "Amber", src: "/avatars/amber.svg" },
  { id: "olive", label: "Olive", src: "/avatars/olive.svg" },
  { id: "coral", label: "Coral", src: "/avatars/coral.svg" },
  { id: "slate", label: "Slate", src: "/avatars/slate.svg" },
  { id: "rose", label: "Rose", src: "/avatars/rose.svg" },
  { id: "forest", label: "Forest", src: "/avatars/forest.svg" },
  { id: "mark-teal", label: "Mark teal", src: "/avatars/mark-teal.svg" },
  { id: "mark-navy", label: "Mark navy", src: "/avatars/mark-navy.svg" },
  { id: "mark-gold", label: "Mark gold", src: "/avatars/mark-gold.svg" },
  { id: "mark-stone", label: "Mark stone", src: "/avatars/mark-stone.svg" },
];

export function isPresetAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("/avatars/") && AVATAR_PRESETS.some((p) => url.includes(p.src));
}

export function matchingPresetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const hit = AVATAR_PRESETS.find((p) => url.includes(p.src) || url.endsWith(p.src));
  return hit?.id ?? null;
}
