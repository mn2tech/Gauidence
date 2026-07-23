"use client";

import type { ExpertActivity } from "@/lib/experts/expert-types";

type Props = {
  activity: ExpertActivity[];
};

function labelFor(type: string): string {
  return type.replaceAll("_", " ");
}

export default function ExpertActivityPanel({ activity }: Props) {
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-5 text-sm text-ink-muted">
        No activity yet. Start learning or ask a question to see your history here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="font-semibold">Recent activity</h2>
      <ul className="mt-4 space-y-3">
        {activity.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <div>
              <p className="font-medium capitalize">{labelFor(item.activity_type)}</p>
              {item.content_id ? (
                <p className="text-ink-muted">{item.content_id}</p>
              ) : null}
            </div>
            <time className="shrink-0 text-xs text-ink-muted">
              {new Date(item.created_at).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}
