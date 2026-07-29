"use client";

import { useCallback, useEffect, useState } from "react";
import type { EmployeeHubEntitlements } from "@/lib/employee-hub/types";
import { defaultEmployeeEntitlements } from "@/lib/employee-hub/entitlements";

export function useEmployeeHubEntitlements(
  employeeProfileId: string | undefined,
  businessProfileId: string | undefined
) {
  const [entitlements, setEntitlements] = useState<EmployeeHubEntitlements | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!employeeProfileId) {
      setEntitlements(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/employee-hub/entitlements?employeeProfileId=${encodeURIComponent(employeeProfileId)}`
      );
      const body = await res.json();
      if (res.ok && body.entitlements) {
        setEntitlements(body.entitlements as EmployeeHubEntitlements);
      } else if (businessProfileId) {
        setEntitlements(defaultEmployeeEntitlements(businessProfileId, employeeProfileId));
      }
    } catch {
      if (businessProfileId) {
        setEntitlements(defaultEmployeeEntitlements(businessProfileId, employeeProfileId));
      }
    } finally {
      setLoading(false);
    }
  }, [employeeProfileId, businessProfileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolved =
    entitlements ??
    (employeeProfileId && businessProfileId
      ? defaultEmployeeEntitlements(businessProfileId, employeeProfileId)
      : null);

  return { entitlements: resolved, loading, refresh };
}
