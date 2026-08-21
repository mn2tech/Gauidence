"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import UpgradeModal from "@/components/UpgradeModal";
import type { PaidPlanId } from "@/lib/billing/plans";
import { PRO_PLAN_ID } from "@/lib/billing/plans";

type UpgradeRequest = {
  reason?: string | null;
  plan?: PaidPlanId;
};

type UpgradeContextValue = {
  openUpgrade: (opts?: UpgradeRequest) => void;
  closeUpgrade: () => void;
};

const UpgradeContext = createContext<UpgradeContextValue | null>(null);

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [plan, setPlan] = useState<PaidPlanId>(PRO_PLAN_ID);

  const openUpgrade = useCallback((opts?: UpgradeRequest) => {
    setReason(opts?.reason ?? null);
    setPlan(opts?.plan ?? PRO_PLAN_ID);
    setOpen(true);
  }, []);

  const closeUpgrade = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openUpgrade, closeUpgrade }),
    [openUpgrade, closeUpgrade]
  );

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      <UpgradeModal
        open={open}
        onClose={closeUpgrade}
        reason={reason}
        plan={plan}
      />
    </UpgradeContext.Provider>
  );
}

export function useUpgradeModal(): UpgradeContextValue {
  const ctx = useContext(UpgradeContext);
  if (!ctx) {
    return {
      openUpgrade: () => {
        if (typeof window !== "undefined") {
          window.location.assign("/settings#billing");
        }
      },
      closeUpgrade: () => undefined,
    };
  }
  return ctx;
}

/** Detect plan_limit API errors and surface the upgrade modal. */
export function isPlanLimitPayload(body: unknown): body is {
  code: string;
  error?: string;
  feature?: string;
} {
  return (
    !!body &&
    typeof body === "object" &&
    "code" in body &&
    (body as { code?: string }).code === "plan_limit"
  );
}
