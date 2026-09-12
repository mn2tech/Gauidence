import type { GideonWelcomeViewModel } from "@/lib/gideon-welcome/types";
import type { SearchScopeMode } from "@/lib/workspace-context/searchScope";

type GreetingHeaderProps = {
  greeting: string;
  view: GideonWelcomeViewModel;
  mode?: "default" | "today" | "ask";
  searchScope?: SearchScopeMode;
};

export default function GreetingHeader({
  greeting,
  view,
  mode = "default",
  searchScope = "global",
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
      ) : mode === "ask" ? (
        <p className="text-sm text-ink-muted">
          {searchScope === "global"
            ? "Ask across all your spaces — uploads still save to your file home."
            : `Ask only within ${spaceName ?? "this space"} — uploads save here.`}
        </p>
      ) : isNewUser && isEmptySpace ? (
        <div className="space-y-1 text-sm text-ink-muted">
          <p className="font-medium text-foreground">Welcome to Guardian</p>
          <p>
            Tell Gideon what matters, upload a file, or ask across everything
            you&apos;ve shared — no need to pick a Space first.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Ask across all your spaces
          {spaceName ? (
            <>
              {" "}
              · file home{" "}
              <span className="font-semibold text-foreground">{spaceName}</span>
            </>
          ) : null}
          .
        </p>
      )}
    </header>
  );
}
