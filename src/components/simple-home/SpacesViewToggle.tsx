"use client";

import Link from "next/link";
import { LayoutGrid, Network } from "lucide-react";
import { vaultsHref, type SpacesView } from "@/lib/simple-home/routing";

export default function SpacesViewToggle({ view }: { view: SpacesView }) {
  return (
    <div
      className="inline-flex rounded-full border border-stone-300 bg-stone-50 p-1"
      role="tablist"
      aria-label="Spaces view"
    >
      <Link
        href={vaultsHref("list")}
        role="tab"
        aria-selected={view === "list"}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          view === "list"
            ? "bg-white text-foreground shadow-sm"
            : "text-ink-muted hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        List
      </Link>
      <Link
        href={vaultsHref("map")}
        role="tab"
        aria-selected={view === "map"}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          view === "map"
            ? "bg-white text-foreground shadow-sm"
            : "text-ink-muted hover:text-foreground"
        }`}
      >
        <Network className="h-4 w-4" aria-hidden />
        Map
      </Link>
    </div>
  );
}
