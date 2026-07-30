"use client";

import { useCallback, useEffect, useState } from "react";

export function useSimpleHomeEnabled() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/features/simple-home");
      const body = (await res.json().catch(() => ({}))) as {
        enabled?: boolean;
      };
      setEnabled(Boolean(body.enabled));
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { enabled, loading, refresh };
}
