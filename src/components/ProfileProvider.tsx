"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GuardianProfile } from "@/lib/profiles/types";

type ProfilesState = {
  profiles: GuardianProfile[];
  active: GuardianProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<boolean>;
};

const ProfileContext = createContext<ProfilesState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<GuardianProfile[]>([]);
  const [active, setActive] = useState<GuardianProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/profiles");
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        profiles?: GuardianProfile[];
        active?: GuardianProfile;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setProfiles([]);
          setActive(null);
          return;
        }
        setError(body.error ?? "Couldn't load profiles.");
        return;
      }
      setProfiles(body.profiles ?? []);
      setActive(body.active ?? null);
    } catch {
      setError("Couldn't load profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchProfile = useCallback(async (profileId: string) => {
    setError(null);
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch", profileId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      profiles?: GuardianProfile[];
      active?: GuardianProfile;
    };
    if (!res.ok) {
      setError(body.error ?? "Couldn't switch profile.");
      return false;
    }
    setProfiles(body.profiles ?? []);
    setActive(body.active ?? null);
    window.dispatchEvent(
      new CustomEvent("guardian:profile-changed", {
        detail: { profileId: body.active?.id },
      })
    );
    return true;
  }, []);

  const value = useMemo(
    () => ({ profiles, active, loading, error, refresh, switchProfile }),
    [profiles, active, loading, error, refresh, switchProfile]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useActiveProfile(): ProfilesState {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    return {
      profiles: [],
      active: null,
      loading: false,
      error: null,
      refresh: async () => {},
      switchProfile: async () => false,
    };
  }
  return ctx;
}
