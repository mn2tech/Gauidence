"use client";

import { useCallback, useEffect, useState } from "react";

export const GIDEON_CHAT_THEME_STORAGE_KEY = "guardian.gideonChatTheme";

export type GideonChatTheme = "light" | "dark";

/** Ask Gideon defaults to dark (ChatGPT-style); light only when explicitly chosen. */
function parseTheme(raw: string | null | undefined): GideonChatTheme {
  return raw === "light" ? "light" : "dark";
}

function readStored(): GideonChatTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return parseTheme(window.localStorage.getItem(GIDEON_CHAT_THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

function writeStored(theme: GideonChatTheme): void {
  try {
    window.localStorage.setItem(GIDEON_CHAT_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Ask Gideon chat theme only — does not theme the rest of Guardian. */
export function useGideonChatTheme() {
  const [theme, setThemeState] = useState<GideonChatTheme>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setThemeState(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<GideonChatTheme>).detail;
      if (detail === "dark" || detail === "light") {
        setThemeState(detail);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== GIDEON_CHAT_THEME_STORAGE_KEY) return;
      setThemeState(parseTheme(e.newValue));
    };
    window.addEventListener("guardian:gideon-chat-theme-changed", onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(
        "guardian:gideon-chat-theme-changed",
        onChanged
      );
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: GideonChatTheme) => {
    setThemeState(next);
    writeStored(next);
    window.dispatchEvent(
      new CustomEvent("guardian:gideon-chat-theme-changed", { detail: next })
    );
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, hydrated, setTheme, toggle };
}
