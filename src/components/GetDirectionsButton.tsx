"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { openDrivingDirections } from "@/lib/location/directions";

type Props = {
  destination: string;
  label?: string;
  className?: string;
};

export default function GetDirectionsButton({
  destination,
  label = "Directions",
  className = "inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!destination.trim()) return null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void openDrivingDirections(destination).catch((err: unknown) => {
            setError(
              err instanceof Error ? err.message : "Could not open directions."
            );
          }).finally(() => setBusy(false));
        }}
        className={className}
        title="Open driving directions using your current location"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <MapPin className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </button>
      {error ? (
        <span className="max-w-[14rem] text-[11px] leading-snug text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
