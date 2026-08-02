"use client";

import { useCallback, useEffect, useState } from "react";
import { AGENT_MODE_STORAGE_KEY } from "@/lib/agent-mode";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AGENT_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStored(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      AGENT_MODE_STORAGE_KEY,
      enabled ? "true" : "false"
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Client-side Agent Mode toggle (persisted in localStorage). */
export function useAgentMode() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(readStored());
    setHydrated(true);
  }, []);

  const setAgentMode = useCallback((next: boolean) => {
    setEnabled(next);
    writeStored(next);
    window.dispatchEvent(
      new CustomEvent("guardian:agent-mode-changed", { detail: next })
    );
  }, []);

  const toggle = useCallback(() => {
    setAgentMode(!enabled);
  }, [enabled, setAgentMode]);

  return { enabled, hydrated, setAgentMode, toggle };
}
