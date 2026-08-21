import type { GideonWelcomeViewModel } from "@/lib/gideon-welcome/types";

type GreetingHeaderProps = {
  greeting: string;
  view: GideonWelcomeViewModel;
};

export default function GreetingHeader({ greeting, view }: GreetingHeaderProps) {
  const { greetName, spaceName, isNewUser, isEmptySpace } = view;

  const headline = greetName
    ? `${greeting}, ${greetName}.`
    : `${greeting}.`;

  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">
        {headline}
      </h1>

      {isNewUser && isEmptySpace ? (
        <div className="space-y-1 text-sm text-ink-muted">
          <p className="font-medium text-foreground">Welcome to Guardian.</p>
          <p>
            Guardian remembers what matters and helps you act on it. Add
            something to this Space to get started.
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
