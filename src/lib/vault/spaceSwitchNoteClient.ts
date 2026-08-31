/** Ephemeral note after Ask auto-routes into a named Space (survives draft navigation). */
const SPACE_SWITCH_NOTE_KEY = "gideon-space-switch-note";

function readSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function rememberSpaceSwitchNote(spaceName: string): void {
  const name = spaceName.trim();
  const storage = readSessionStorage();
  if (!name || !storage) return;
  try {
    storage.setItem(SPACE_SWITCH_NOTE_KEY, name);
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeSpaceSwitchNote(): string | null {
  const storage = readSessionStorage();
  if (!storage) return null;
  try {
    const name = storage.getItem(SPACE_SWITCH_NOTE_KEY)?.trim() || null;
    if (name) storage.removeItem(SPACE_SWITCH_NOTE_KEY);
    return name;
  } catch {
    return null;
  }
}
