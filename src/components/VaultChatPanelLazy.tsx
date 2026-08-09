"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("@/components/VaultChatPanel"), {
  loading: () => (
    <p className="p-6 text-sm text-ink-muted">Loading Ask Gideon…</p>
  ),
  ssr: false,
});
