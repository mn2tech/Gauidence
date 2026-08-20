import type { GideonWelcomeViewModel } from "@/lib/gideon-welcome/types";

type GreetingHeaderProps = {
  greeting: string;
  view: GideonWelcomeViewModel;
};

export default function GreetingHeader({ greeting, view }: GreetingHeaderProps) {
  const { greetName, spaceName, isNewUser, isEmptySpace } = view;

  const headline = greetName
    ? `${greeting}, ${greetName} 👋`
    : `${greeting} 👋`;

  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">
        {headline}
      </h1>

      {isNewUser && isEmptySpace ? (
        <div className="space-y-1 text-sm text-ink-muted">
          <p>Welcome to Guardian.</p>
          <p>
            I&apos;m Gideon. I&apos;ll help you keep track of the information
            that matters to you.
          </p>
          <p className="pt-0.5">Your Space is empty right now, so let&apos;s get started.</p>
        </div>
      ) : spaceName ? (
        <p className="text-sm text-ink-muted">
          Welcome back to{" "}
          <span className="font-semibold text-foreground">{spaceName}</span>.
        </p>
      ) : (
        <p className="text-sm text-ink-muted">Welcome back to Guardian.</p>
      )}
    </header>
  );
}
