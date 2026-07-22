"use client";

import { useCallback, useEffect, useState } from "react";
import type { AwardKey } from "@/lib/awards/definitions";

export type AwardStatus = {
  key: AwardKey;
  title: string;
  description: string;
  sortOrder: number;
  earned: boolean;
  earnedAt: string | null;
};

type AwardsPayload = {
  awards: AwardStatus[];
  earnedCount: number;
  totalCount: number;
  newlyGranted?: AwardKey[];
};

export function useAwards() {
  const [awards, setAwards] = useState<AwardStatus[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/awards");
      const body = (await res.json().catch(() => null)) as AwardsPayload | null;
      if (!res.ok || !body?.awards) return;
      setAwards(body.awards);
      setEarnedCount(body.earnedCount);
      setTotalCount(body.totalCount);
      if (body.newlyGranted?.length) {
        window.dispatchEvent(
          new CustomEvent("guardian:award-earned", {
            detail: { keys: body.newlyGranted },
          })
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onEarned = () => void refresh();
    window.addEventListener("guardian:award-earned", onEarned);
    window.addEventListener("guardian:profile-changed", onEarned);
    return () => {
      window.removeEventListener("guardian:award-earned", onEarned);
      window.removeEventListener("guardian:profile-changed", onEarned);
    };
  }, [refresh]);

  return { awards, earnedCount, totalCount, loading, refresh };
}
