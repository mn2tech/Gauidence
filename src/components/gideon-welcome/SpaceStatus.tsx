import { CircleDot } from "lucide-react";
import type { GideonWelcomeViewModel } from "@/lib/gideon-welcome/types";

type SpaceStatusProps = {
  view: GideonWelcomeViewModel;
  mode?: "default" | "ask";
};

export default function SpaceStatus({ view, mode = "default" }: SpaceStatusProps) {
  const { spaceName, isEmptySpace, statusItems, statusUnavailable } = view;

  if (statusUnavailable) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">You&apos;re ready to ask.</p>
        <p className="text-sm text-ink-muted">What would you like to do?</p>
      </div>
    );
  }

  if (isEmptySpace) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Ready when you are — upload, remember, or just ask.
        </p>
        {view.isNewUser ? (
          <p className="text-sm text-ink-muted">What would you like to add first?</p>
        ) : (
          <p className="text-sm text-ink-muted">What would you like to do?</p>
        )}
      </div>
    );
  }

  if (statusItems.length === 0) {
    return (
      <p className="text-sm text-ink-muted">What would you like to do?</p>
    );
  }

  const title =
    mode === "ask"
      ? "Here's what's on your plate:"
      : spaceName
        ? `Snapshot from ${spaceName}:`
        : "Here's what's happening:";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="space-y-1.5">
        {statusItems.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm text-ink-muted">
            <CircleDot
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
              aria-hidden
            />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
