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
  accountName: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<boolean>;
};

const ProfileContext = createContext<ProfilesState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<GuardianProfile[]>([]);
  const [active, setActive] = useState<GuardianProfile | null>(null);
  const [accountName, setAccountName] = useState("You");
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
        accountName?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setProfiles([]);
          setActive(null);
          setAccountName("You");
          return;
        }
        setError(body.error ?? "Couldn't load profiles.");
        return;
      }
      setProfiles(body.profiles ?? []);
      setActive(body.active ?? null);
      setAccountName(body.accountName?.trim() || "You");
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
      accountName?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Couldn't switch profile.");
      return false;
    }
    setProfiles(body.profiles ?? []);
    setActive(body.active ?? null);
    if (body.accountName?.trim()) {
      setAccountName(body.accountName.trim());
    }
    window.dispatchEvent(
      new CustomEvent("guardian:profile-changed", {
        detail: { profileId: body.active?.id },
      })
    );
    return true;
  }, []);

  const value = useMemo(
    () => ({
      profiles,
      active,
      accountName,
      loading,
      error,
      refresh,
      switchProfile,
    }),
    [profiles, active, accountName, loading, error, refresh, switchProfile]
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
      accountName: "You",
      loading: false,
      error: null,
      refresh: async () => {},
      switchProfile: async () => false,
    };
  }
  return ctx;
}
