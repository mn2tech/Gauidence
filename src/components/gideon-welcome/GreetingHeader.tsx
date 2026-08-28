import type { GideonWelcomeViewModel } from "@/lib/gideon-welcome/types";

type GreetingHeaderProps = {
  greeting: string;
  view: GideonWelcomeViewModel;
  mode?: "default" | "today";
};

export default function GreetingHeader({
  greeting,
  view,
  mode = "default",
}: GreetingHeaderProps) {
  const { greetName, spaceName, isNewUser, isEmptySpace } = view;

  const headline = greetName
    ? `${greeting}, ${greetName}.`
    : `${greeting}.`;

  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">
        {headline}
      </h1>

      {mode === "today" ? (
        <p className="text-sm text-ink-muted">
          Here&apos;s what needs your attention today.
        </p>
      ) : isNewUser && isEmptySpace ? (
        <div className="space-y-1 text-sm text-ink-muted">
          <p className="font-medium text-foreground">Welcome to Guardian</p>
          <p>
            Your Personal Space is where Guardian learns what matters to you
            and helps you remember, organize, and act.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Here&apos;s what&apos;s happening across your Guardian
          {spaceName ? (
            <>
              {" "}
              — starting with{" "}
              <span className="font-semibold text-foreground">{spaceName}</span>
            </>
          ) : null}
          .
        </p>
      )}
    </header>
  );
}
