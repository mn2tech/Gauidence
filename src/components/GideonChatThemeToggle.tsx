"use client";

import { Moon, Sun } from "lucide-react";
import { useGideonChatTheme } from "@/hooks/useGideonChatTheme";

type Props = {
  className?: string;
};

/** Compact ChatGPT-style light/dark toggle for Ask Gideon only. */
export default function GideonChatThemeToggle({ className = "" }: Props) {
  const { theme, hydrated, toggle } = useGideonChatTheme();

  if (!hydrated) return null;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`inline-flex items-center justify-center rounded-full border border-stone-300 bg-white p-2 text-ink-muted transition hover:bg-stone-50 hover:text-foreground ${className}`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Moon className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
