"use client";

export type WorkspaceTimelineItem = {
  id: string;
  title: string;
  eventDate: string | null;
  category: string | null;
};

type Props = {
  events: WorkspaceTimelineItem[];
  className?: string;
};

function formatEventDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function GideonWorkspaceTimeline({
  events,
  className = "",
}: Props) {
  if (events.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-stone-200 bg-white px-3 py-2.5 ${className}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Workspace timeline
      </p>
      <ul className="mt-1.5 space-y-1">
        {events.slice(0, 6).map((event) => (
          <li
            key={event.id}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate font-medium text-foreground">
              {event.title}
            </span>
            {event.eventDate ? (
              <span className="shrink-0 text-[10px] text-ink-muted">
                {formatEventDate(event.eventDate)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
