"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("@/components/DashboardVault"), {
  loading: () => (
    <p className="py-12 text-center text-sm text-ink-muted">Loading vault…</p>
  ),
});
