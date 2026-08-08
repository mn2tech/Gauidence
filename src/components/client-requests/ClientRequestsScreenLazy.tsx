"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/components/client-requests/ClientRequestsScreen"),
  {
    loading: () => (
      <p className="text-sm text-ink-muted">Loading requests…</p>
    ),
  }
);
