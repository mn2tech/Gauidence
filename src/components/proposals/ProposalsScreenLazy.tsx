"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/components/proposals/ProposalsScreen"),
  {
    loading: () => (
      <p className="text-sm text-ink-muted">Loading proposals…</p>
    ),
  }
);
