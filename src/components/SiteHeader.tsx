import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          Guardian
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-muted">
          <Link href="/security" className="hidden hover:text-foreground sm:block">
            Security Principles
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
