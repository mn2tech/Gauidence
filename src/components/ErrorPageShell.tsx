import Link from "next/link";
import GuardianIcon from "@/components/brand/GuardianIcon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

type ErrorPageShellProps = {
  code: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export default function ErrorPageShell({
  code,
  title,
  description,
  actions,
}: ErrorPageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex flex-1 items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-lg text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-brand-light via-background to-background" />

          <GuardianIcon size={56} />

          <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-brand">
            {code}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            {description}
          </p>

          {actions ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {actions}
            </div>
          ) : null}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function ErrorPagePrimaryAction({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
    >
      {children}
    </Link>
  );
}

export function ErrorPageSecondaryAction({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
    >
      {children}
    </Link>
  );
}
