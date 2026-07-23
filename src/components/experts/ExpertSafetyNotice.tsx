"use client";

import type { ExpertDefinition } from "@/lib/experts/expert-schema";

type Props = {
  disclaimer?: string;
  expertName: string;
};

export default function ExpertSafetyNotice({ disclaimer, expertName }: Props) {
  if (!disclaimer) return null;
  return (
    <div
      role="note"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-medium">{expertName} notice</p>
      <p className="mt-1 text-amber-800">{disclaimer}</p>
    </div>
  );
}

export function ExpertFictionalNotice({ notice }: { notice?: string }) {
  if (!notice) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      {notice}
    </div>
  );
}
