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
import { recordVaultAccess } from "@/lib/simple-home/helpers";
import {
  GUARDIAN_TIME_ZONE,
  detectBrowserTimeZone,
  type TimeZoneSource,
} from "@/lib/timezone";

type ProfilesState = {
  profiles: GuardianProfile[];
  active: GuardianProfile | null;
  accountName: string;
  timeZone: string;
  timeZoneLabel: string;
  timeZoneSource: TimeZoneSource;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<boolean>;
  updateTimeZone: (
    timeZone: string,
    source?: "manual" | "auto"
  ) => Promise<boolean>;
};

const ProfileContext = createContext<ProfilesState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<GuardianProfile[]>([]);
  const [active, setActive] = useState<GuardianProfile | null>(null);
  const [accountName, setAccountName] = useState("You");
  const [timeZone, setTimeZone] = useState(GUARDIAN_TIME_ZONE);
  const [timeZoneLabel, setTimeZoneLabel] = useState("Eastern Time");
  const [timeZoneSource, setTimeZoneSource] =
    useState<TimeZoneSource>("default");
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
        timeZone?: string;
        timeZoneLabel?: string;
        timeZoneSource?: TimeZoneSource;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setProfiles([]);
          setActive(null);
          setAccountName("You");
          setTimeZone(GUARDIAN_TIME_ZONE);
          setTimeZoneLabel("Eastern Time");
          setTimeZoneSource("default");
          return;
        }
        setError(body.error ?? "Couldn't load profiles.");
        return;
      }
      setProfiles(body.profiles ?? []);
      setActive(body.active ?? null);
      setAccountName(body.accountName?.trim() || "You");
      if (body.timeZone) setTimeZone(body.timeZone);
      if (body.timeZoneLabel) setTimeZoneLabel(body.timeZoneLabel);
      if (body.timeZoneSource) setTimeZoneSource(body.timeZoneSource);

      const clientTz = detectBrowserTimeZone();
      const shouldAutoDetect =
        body.timeZoneSource === "default" ||
        (body.timeZoneSource === "auto" &&
          body.timeZone === "UTC" &&
          clientTz !== "UTC");

      if (shouldAutoDetect) {
        void fetch("/api/account/timezone", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone: clientTz, source: "auto" }),
        })
          .then((r) => r.json())
          .then(
            (tzBody: {
              timeZone?: string;
              timeZoneLabel?: string;
              timeZoneSource?: TimeZoneSource;
            }) => {
              if (tzBody.timeZone) setTimeZone(tzBody.timeZone);
              if (tzBody.timeZoneLabel) setTimeZoneLabel(tzBody.timeZoneLabel);
              if (tzBody.timeZoneSource) setTimeZoneSource(tzBody.timeZoneSource);
            }
          )
          .catch(() => undefined);
      }
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
    if (body.active?.id) {
      recordVaultAccess(body.active.id);
    }
    window.dispatchEvent(
      new CustomEvent("guardian:profile-changed", {
        detail: { profileId: body.active?.id },
      })
    );
    return true;
  }, []);

  const updateTimeZone = useCallback(
    async (nextZone: string, source: "manual" | "auto" = "manual") => {
      const res = await fetch("/api/account/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: nextZone, source }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        timeZone?: string;
        timeZoneLabel?: string;
        timeZoneSource?: TimeZoneSource;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save timezone.");
        return false;
      }
      if (body.timeZone) setTimeZone(body.timeZone);
      if (body.timeZoneLabel) setTimeZoneLabel(body.timeZoneLabel);
      if (body.timeZoneSource) setTimeZoneSource(body.timeZoneSource);
      return true;
    },
    []
  );

  const value = useMemo(
    () => ({
      profiles,
      active,
      accountName,
      timeZone,
      timeZoneLabel,
      timeZoneSource,
      loading,
      error,
      refresh,
      switchProfile,
      updateTimeZone,
    }),
    [
      profiles,
      active,
      accountName,
      timeZone,
      timeZoneLabel,
      timeZoneSource,
      loading,
      error,
      refresh,
      switchProfile,
      updateTimeZone,
    ]
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
      timeZone: GUARDIAN_TIME_ZONE,
      timeZoneLabel: "Eastern Time",
      timeZoneSource: "default" as const,
      loading: false,
      error: null,
      refresh: async () => {},
      switchProfile: async () => false,
      updateTimeZone: async () => false,
    };
  }
  return ctx;
}
