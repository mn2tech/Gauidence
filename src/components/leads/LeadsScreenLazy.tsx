"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("@/components/leads/LeadsScreen"), {
  loading: () => (
    <p className="text-sm text-ink-muted">Loading leads…</p>
  ),
});
